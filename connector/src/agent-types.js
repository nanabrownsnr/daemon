import { spawn } from "child_process";

function executable(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

export const AGENT_TYPES = {
  claude_code: {
    label: "Claude Code",
    invoke: async (prompt, projectDir, sessionId, spawnProcess = spawn, options = {}) => {
      const allowedTools = options.workspaceWrite
        ? "Read,Grep,Glob,LS,Edit,Write,Bash"
        : "Read,Grep,Glob,LS";
      const baseArgs = [
        "--print", prompt,
        "--output-format", "stream-json",
        "--verbose",
        "--allowedTools", allowedTools,
        ...(options.fullAccess
          ? ["--dangerously-skip-permissions"]
          : ["--permission-mode", "dontAsk"]),
      ];

      const runClaude = (args, fallbackSessionId) => new Promise((resolve) => {
        console.log(`[groupwork] Spawning Claude with args:`, args);
        const child = spawnProcess(executable("claude"), args, {
          cwd: projectDir,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        let lineBuffer = "";
        let streamedResponse = null;
        let finalResponse = null;
        let discoveredSessionId = fallbackSessionId;
        let parseError = null;

        const finish = (result) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        const textFromContent = (content) => {
          if (typeof content === "string") return content.trim() || null;
          if (!Array.isArray(content)) return null;
          const text = content
            .filter((block) => block?.type === "text" && typeof block.text === "string")
            .map((block) => block.text)
            .join("\n")
            .trim();
          return text || null;
        };

        const consumeEvent = (line) => {
          if (!line.trim()) return;
          try {
            const event = JSON.parse(line);
            discoveredSessionId = event.session_id ?? discoveredSessionId;

            // Legacy JSON output remains accepted for adapter compatibility.
            if (!event.type && typeof event.result === "string" && event.result.trim()) {
              finalResponse = event.result.trim();
            }
            if (event.type === "assistant") {
              const assistantText = textFromContent(event.message?.content ?? event.content);
              if (assistantText) streamedResponse = assistantText;
            }
            if (event.type === "result" && typeof event.result === "string" && event.result.trim()) {
              finalResponse = event.result.trim();
            }
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
          for (const line of lines) consumeEvent(line);
          console.log(`[groupwork] [stdout chunk received: ${chunk.length} bytes]`);
        });

        child.stderr.on("data", (data) => {
          const chunk = data.toString();
          stderr += chunk;
          console.error(`[groupwork] [stderr]: ${chunk.trim()}`);
        });

        child.on("error", (err) => {
          console.error(`[groupwork] Failed to start Claude Code CLI (${executable("claude")}). Install/authenticate Claude Code CLI, then run groupwork-connect doctor: ${err.message}`);
          finish({ response: null, sessionId: fallbackSessionId, failed: true });
        });

        child.on("close", (code) => {
          console.log(`[groupwork] Claude process closed with exit code: ${code}`);
          console.log(`[groupwork] Total stdout accumulated: ${stdout.length} characters`);
          console.log(`[groupwork] Total stderr accumulated: ${stderr.length} characters`);

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
            console.error(`[groupwork] Claude exited with code ${code}${detail ? `: ${String(detail).slice(0, 500)}` : "."}`);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
            return;
          }

          if (!stdout || stdout.trim().length === 0) {
            console.error(`[groupwork] FAILURE: Process exited with code 0 but stdout is completely empty.`);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
            return;
          }

          consumeEvent(lineBuffer);
          const agentResponse = finalResponse ?? streamedResponse;

          if (agentResponse) {
            if (!finalResponse && streamedResponse) {
              console.warn("[groupwork] Claude result event was empty; recovered the final assistant message from stream-json.");
            } else {
              console.log("[groupwork] Successfully parsed Claude response.");
            }
            finish({ response: agentResponse, sessionId: discoveredSessionId, failed: false });
            return;
          }

          console.error("[groupwork] Claude completed successfully but produced no textual assistant response.");
          if (parseError) console.error("[groupwork] Last Claude JSONL parse error:", parseError.message);
          console.error(`[groupwork] Claude event payload preview: ${stdout.trim().slice(0, 1200)}`);
          finish({ response: null, sessionId: discoveredSessionId, failed: true });
        });

        child.stdin.end();
      });

      if (sessionId) {
        console.log(`[groupwork] Resuming specific session ID: ${sessionId}`);
        const resumed = await runClaude([...baseArgs, "--resume", sessionId], sessionId);
        return { response: resumed.response, sessionId: resumed.sessionId };
      }

      console.log(`[groupwork] No session ID yet, using --continue for latest conversation.`);
      const continued = await runClaude([...baseArgs, "--continue"], null);
      if (!continued.failed) {
        return { response: continued.response, sessionId: continued.sessionId };
      }

      console.log("[groupwork] No resumable Claude conversation found; starting a new one.");
      const created = await runClaude(baseArgs, null);
      return { response: created.response, sessionId: created.sessionId };
    },
  },
  codex_cli: {
    label: "Codex CLI",
    invoke: async (prompt, projectDir, sessionId, spawnProcess = spawn, options = {}) => {
      const runCodex = (args, fallbackSessionId) => new Promise((resolve) => {
        const child = spawnProcess(executable("codex"), args, {
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
          console.log("[groupwork] Codex turn completed; returning response to groupwork.");
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
          console.error(`[groupwork] Failed to start Codex CLI (${executable("codex")}). Install/authenticate Codex CLI, then run groupwork-connect doctor: ${error.message}`);
          finish({ response: null, sessionId: fallbackSessionId, failed: true });
        });

        child.on("close", (code) => {
          consumeLine(lineBuffer);
          if (code !== 0) {
            console.error(`[groupwork] Codex exited with code ${code}: ${stderr.trim()}`);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
            return;
          }

          if (parseError && !response) {
            console.error("[groupwork] Failed to parse Codex JSONL output:", parseError.message);
            finish({ response: null, sessionId: fallbackSessionId, failed: true });
            return;
          }

          if (!response) {
            console.error("[groupwork] Codex completed without an agent message.");
          }
          finish({ response, sessionId: newSessionId, failed: false });
        });

        child.stdin.end();
      });

      const baseArgs = options.fullAccess
        ? ["--dangerously-bypass-approvals-and-sandbox", "exec"]
        : options.workspaceWrite
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
        console.log(`[groupwork] Resuming Codex session ID: ${sessionId}`);
        const result = await runCodex([
          ...baseArgs,
          "resume", "--json", "--skip-git-repo-check", sessionId, prompt,
        ], sessionId);
        return { response: result.response, sessionId: result.sessionId };
      }

      console.log(`[groupwork] Attaching to the latest Codex session in ${projectDir}.`);
      const latest = await runCodex([
        ...baseArgs,
        "resume", "--last", "--json", "--skip-git-repo-check", prompt,
      ], null);

      if (!latest.failed) {
        return { response: latest.response, sessionId: latest.sessionId };
      }

      console.log("[groupwork] No resumable Codex session found; starting a new one.");
      const created = await runCodex([
        ...baseArgs,
        "--json", "--skip-git-repo-check", prompt,
      ], null);
      return { response: created.response, sessionId: created.sessionId };
    },
  },
};
