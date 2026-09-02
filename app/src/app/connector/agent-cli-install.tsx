"use client";

import { useState, useSyncExternalStore } from "react";
import CopyCommand from "./copy-command";

type Platform = "windows" | "linux" | "macos";
type Agent = "codex" | "claude";

const codexCommands: Record<Platform, string> = {
  windows: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
  linux: "curl -fsSL https://chatgpt.com | bash",
  macos: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
};

function detectPlatform(): Platform {
  const browserNavigator = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (browserNavigator.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent).toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  return "linux";
}

export default function AgentCliInstall() {
  const [agent, setAgent] = useState<Agent>("codex");
  const detectedPlatform = useSyncExternalStore(
    () => () => undefined,
    detectPlatform,
    () => "linux" as Platform,
  );
  const [platformOverride, setPlatformOverride] = useState<Platform | null>(null);
  const platform = platformOverride ?? detectedPlatform;

  return (
    <div className="mt-2 space-y-3 rounded border border-neutral-800 p-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
        <label>
          Agent{" "}
          <select
            value={agent}
            onChange={(event) => setAgent(event.target.value as Agent)}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
          >
            <option value="codex">Codex CLI</option>
            <option value="claude">Claude Code CLI</option>
          </select>
        </label>
        <label>
          Platform{" "}
          <select
            value={platform}
            onChange={(event) => setPlatformOverride(event.target.value as Platform)}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
          >
            <option value="windows">Windows PowerShell</option>
            <option value="linux">Linux / WSL</option>
            <option value="macos">macOS</option>
          </select>
        </label>
      </div>
      <CopyCommand
        command={agent === "codex" ? codexCommands[platform] : "npm install -g @anthropic-ai/claude-code"}
      />
      <p className="text-xs leading-5 text-neutral-500">
        Install and authenticate this terminal CLI in the same environment where groupwork-connect will run. These are not the Claude or ChatGPT web/desktop apps.
      </p>
    </div>
  );
}
