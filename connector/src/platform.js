export function agentExecutable(command, platform = process.platform) {
  if (platform !== "win32") return command;
  // The official Codex for Windows install exposes a native executable. The
  // npm codex.cmd shim needs a shell, which changes how arbitrary chat prompts
  // are passed to the process, so use the native CLI directly.
  return command === "codex" ? "codex.exe" : `${command}.cmd`;
}

export function isSupportedNodeVersion(version) {
  const major = Number.parseInt(String(version).split(".")[0], 10);
  return Number.isFinite(major) && major >= 22;
}
