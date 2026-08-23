import { spawn } from "child_process";

export const AGENT_TYPES = {
  claude_code: {
    label: "Claude Code",
    invoke: async (prompt, projectDir, sessionId, spawnProcess = spawn, options = {}) => {
      const allowedTools = options.workspaceWrite
        ? "Read,Grep,Glob,LS,Edit,Write,Bash"
        : "Read,Grep,Glob,LS";
      const baseArgs = [
        "--print", prompt,
        "--output-format", "json",
        "--allowedTools", allowedTools,
        "--permission-mode", "dontAsk"
      ];

      const runClaude = (args, fallbackSessionId) => new Promise((resolve) => {
        console.log(`[daemon] Spawning Claude with args:`, args);
        const child = spawnProcess("claude", args, {
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
          finish({ response: null, sessionId: fallbackSessionId, failed: true });
        });

        child.on("close", (code) => {
          console.log(`[daemon] Claude process closed with exit code: ${code}`);
          console.log(`[daemon] Total stdout accumulated: ${stdout.length} characters`);
          console.log(`[daemon] Total stderr accumulated: ${stderr.length} characters`);

          if (code !== 0) {
            let detail = stderr.trim();
            if (!detail && stdout.trim()) {
              try {
                const errorPayload = JSON.parse(stdout.trim());
                detail = errorPayload.error?.message ?? errorPayload.error ?? errorPayload.result ?? errorPayload.message ?? "";
              } catch {
                detail = "Claude returned a non-JSON error payload.";
              }
            }
            console.error(`[daemon] Claude exited with code ${code}${detail ? `: ${String(detail).slice(0, 500)}` : "."}`);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
            return;
          }

          if (!stdout || stdout.trim().length === 0) {
            console.error(`[daemon] FAILURE: Process exited with code 0 but stdout is completely empty.`);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
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

            finish({
              response: agentResponse,
              sessionId: result.session_id ?? fallbackSessionId,
              failed: !agentResponse,
            });
          } catch (parseErr) {
            console.error("[daemon] FAILURE: Failed to parse Claude JSON output.");
            console.error("[daemon] Parse error details:", parseErr.message);
            console.error("[daemon] Raw stdout payload that failed parsing:\n-----\n", stdout, "\n-----");
            
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
          }
        });

        child.stdin.end();
      });

      if (sessionId) {
        console.log(`[daemon] Resuming specific session ID: ${sessionId}`);
        const resumed = await runClaude([...baseArgs, "--resume", sessionId], sessionId);
        return { response: resumed.response, sessionId: resumed.sessionId };
      }

      console.log(`[daemon] No session ID yet, using --continue for latest conversation.`);
      const continued = await runClaude([...baseArgs, "--continue"], null);
      if (!continued.failed) {
        return { response: continued.response, sessionId: continued.sessionId };
      }

      console.log("[daemon] No resumable Claude conversation found; starting a new one.");
      const created = await runClaude(baseArgs, null);
      return { response: created.response, sessionId: created.sessionId };
    },
  },
  codex_cli: {
    label: "Codex CLI",
    invoke: async (prompt, projectDir, sessionId, spawnProcess = spawn, options = {}) => {
      const runCodex = (args, fallbackSessionId) => new Promise((resolve) => {
        const child = spawnProcess("codex", args, {
          cwd: projectDir,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        let lineBuffer = "";
        let newSessionId = fallbackSessionId;
        let response = null;
        let parseError = null;

        const finish = (result) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        const finishCompletedTurn = () => {
          if (!response || settled) return;
          console.log("[daemon] Codex turn completed; returning response to Groupwork.");
          // A detached server can keep inherited descriptors open, preventing
          // Node's `close` event even though Codex has completed its turn.
          // Disconnect our streams without killing the detached workload.
          child.stdout.destroy?.();
          child.stderr.destroy?.();
          child.stdin.destroy?.();
          child.unref?.();
          finish({ response, sessionId: newSessionId, failed: false });
        };

        const consumeLine = (line) => {
          if (!line.trim() || settled) return;
          try {
            const event = JSON.parse(line);
            if (event.type === "thread.started" && event.thread_id) {
              newSessionId = event.thread_id;
            }
            if (event.type === "item.completed"
                && event.item?.type === "agent_message"
                && event.item.text?.trim()) {
              response = event.item.text.trim();
            }
            if (event.type === "turn.completed") finishCompletedTurn();
          } catch (error) {
            parseError = error;
          }
        };

        child.stdout.on("data", (data) => {
          const chunk = data.toString();
          stdout += chunk;
          lineBuffer += chunk;
          const lines = lineBuffer.split(/\r?\n/);
          lineBuffer = lines.pop() ?? "";
          for (const line of lines) consumeLine(line);
        });

        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        child.on("error", (error) => {
          console.error("[daemon] Failed to start Codex CLI:", error.message);
          finish({ response: null, sessionId: fallbackSessionId, failed: true });
        });

        child.on("close", (code) => {
          consumeLine(lineBuffer);
          if (code !== 0) {
            console.error(`[daemon] Codex exited with code ${code}: ${stderr.trim()}`);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
            return;
          }

          if (parseError && !response) {
            console.error("[daemon] Failed to parse Codex JSONL output:", parseError.message);
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

      const baseArgs = options.workspaceWrite
        // --approve-for-me already selects Codex's workspace-write sandbox;
        // passing --sandbox with it is rejected by current Codex CLI versions.
        ? [
            ...(options.networkAccess
              ? ["-c", "sandbox_workspace_write.network_access=true"]
              : []),
            "--approve-for-me",
            "exec",
          ]
        : ["--sandbox", "read-only", "exec"];

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
