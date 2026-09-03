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

const claudeCommands: Record<Platform, string> = {
  windows: "irm https://claude.ai/install.ps1 | iex",
  linux: "curl -fsSL https://claude.ai/install.sh | bash",
  macos: "curl -fsSL https://claude.ai/install.sh | bash",
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
      <div className="space-y-3 text-xs text-neutral-400">
        <div className="space-y-1.5" role="group" aria-label="Agent CLI">
          <span className="block text-neutral-500">Agent</span>
          <div className="flex flex-wrap gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
            {(["codex", "claude"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAgent(option)}
                aria-pressed={agent === option}
                className={`rounded-md px-3 py-1.5 transition-colors ${agent === option ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"}`}
              >
                {option === "codex" ? "Codex CLI" : "Claude Code CLI"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5" role="group" aria-label="Operating system">
          <span className="block text-neutral-500">Platform</span>
          <div className="flex flex-wrap gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
            {(["windows", "linux", "macos"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPlatformOverride(option)}
                aria-pressed={platform === option}
                className={`rounded-md px-3 py-1.5 transition-colors ${platform === option ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"}`}
              >
                {option === "windows" ? "Windows" : option === "linux" ? "Linux / WSL" : "macOS"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <CopyCommand
        command={agent === "codex" ? codexCommands[platform] : claudeCommands[platform]}
      />
      <p className="text-xs leading-5 text-neutral-500">
        Install and authenticate this terminal CLI in the same environment where groupwork-connect will run. These are not the Claude or ChatGPT web/desktop apps.
      </p>
    </div>
  );
}
