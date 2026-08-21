import { spawn } from "child_process";

export const AGENT_TYPES = {
  claude_code: {
    label: "Claude Code",
    invoke: async (prompt, projectDir, sessionId, spawnProcess = spawn) => {
      const args = [
        "--print", prompt,
        "--output-format", "json",
        "--allowedTools", "Read,Grep,Glob,LS",
        "--dangerously-skip-permissions"
      ];
      
      if (sessionId) {
        args.push("--resume", sessionId);
        console.log(`[daemon] Resuming specific session ID: ${sessionId}`);
      } else {
        args.push("--continue");
        console.log(`[daemon] No session ID yet, using --continue for latest conversation.`);
      }

      console.log(`[daemon] Spawning Claude with args:`, args);

      return new Promise((resolve) => {
        const child = spawnProcess("claude", args, {
          cwd: projectDir,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => {
          const chunk = data.toString();
          stdout += chunk;
          console.log(`[daemon] [stdout chunk received: ${chunk.length} bytes]`);
        });

        child.stderr.on("data", (data) => {
          const chunk = data.toString();
          stderr += chunk;
          console.error(`[daemon] [stderr]: ${chunk.trim()}`);
        });

        child.on("error", (err) => {
          console.error("[daemon] Failed to start Claude process natively:", err);
          resolve({ response: null, sessionId });
        });

        child.on("close", (code) => {
          console.log(`[daemon] Claude process closed with exit code: ${code}`);
          console.log(`[daemon] Total stdout accumulated: ${stdout.length} characters`);
          console.log(`[daemon] Total stderr accumulated: ${stderr.length} characters`);

          if (code !== 0) {
            console.error(`[daemon] FAILURE: Non-zero exit code (${code}). Stderr dump:\n${stderr}`);
            resolve({ response: null, sessionId });
            return;
          }

          if (!stdout || stdout.trim().length === 0) {
            console.error(`[daemon] FAILURE: Process exited with code 0 but stdout is completely empty.`);
            resolve({ response: null, sessionId });
            return;
          }

          try {
            const trimmedStdout = stdout.trim();
            const result = JSON.parse(trimmedStdout);
            
            console.log("[daemon] Successfully parsed JSON output from Claude.");
            
            const agentResponse = result.result && result.result.trim().length > 0 
              ? result.result 
              : null;

            if (!agentResponse) {
              console.warn("[daemon] Parsed JSON successfully, but 'result.result' field was empty or missing.");
            }

            resolve({
              response: agentResponse,
              sessionId: result.session_id ?? sessionId,
            });
          } catch (parseErr) {
            console.error("[daemon] FAILURE: Failed to parse Claude JSON output.");
            console.error("[daemon] Parse error details:", parseErr.message);
            console.error("[daemon] Raw stdout payload that failed parsing:\n-----\n", stdout, "\n-----");
            
            resolve({ response: null, sessionId });
          }
        });

        child.stdin.end();
      });
    },
  },
  codex_cli: {
    label: "Codex CLI",
    invoke: async (prompt, projectDir, sessionId, spawnProcess = spawn) => {
      const runCodex = (args, fallbackSessionId) => new Promise((resolve) => {
        const child = spawnProcess("codex", args, {
          cwd: projectDir,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let settled = false;

        const finish = (result) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        child.on("error", (error) => {
          console.error("[daemon] Failed to start Codex CLI:", error.message);
          finish({ response: null, sessionId: fallbackSessionId, failed: true });
        });

        child.on("close", (code) => {
          if (code !== 0) {
            console.error(`[daemon] Codex exited with code ${code}: ${stderr.trim()}`);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
            return;
          }

          let newSessionId = fallbackSessionId;
          let response = null;

          try {
            for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
              const event = JSON.parse(line);
              if (event.type === "thread.started" && event.thread_id) {
                newSessionId = event.thread_id;
              }
              if (event.type === "item.completed"
                  && event.item?.type === "agent_message"
                  && event.item.text?.trim()) {
                response = event.item.text.trim();
              }
            }
          } catch (error) {
            console.error("[daemon] Failed to parse Codex JSONL output:", error.message);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
            return;
          }

          if (!response) {
            console.error("[daemon] Codex completed without an agent message.");
          }
          finish({ response, sessionId: newSessionId, failed: false });
        });

        child.stdin.end();
      });

      const baseArgs = [
        "--ask-for-approval", "never",
        "--sandbox", "read-only",
        "exec",
      ];

      if (sessionId) {
        console.log(`[daemon] Resuming Codex session ID: ${sessionId}`);
        const result = await runCodex([
          ...baseArgs,
          "resume", "--json", "--skip-git-repo-check", sessionId, prompt,
        ], sessionId);
        return { response: result.response, sessionId: result.sessionId };
      }

      console.log(`[daemon] Attaching to the latest Codex session in ${projectDir}.`);
      const latest = await runCodex([
        ...baseArgs,
        "resume", "--last", "--json", "--skip-git-repo-check", prompt,
      ], null);

      if (!latest.failed) {
        return { response: latest.response, sessionId: latest.sessionId };
      }

      console.log("[daemon] No resumable Codex session found; starting a new one.");
      const created = await runCodex([
        ...baseArgs,
        "--json", "--skip-git-repo-check", prompt,
      ], null);
      return { response: created.response, sessionId: created.sessionId };
    },
  },
};
