import { existsSync, renameSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const explicitConfigDir = process.env.GROUPWORK_CONFIG_DIR
  ?? process.env.DAEMON_CONFIG_DIR; // one-release compatibility
const groupworkDir = join(homedir(), ".groupwork");
const legacyDir = join(homedir(), ".daemon");

if (!explicitConfigDir && !existsSync(groupworkDir) && existsSync(legacyDir)) {
  renameSync(legacyDir, groupworkDir);
}

export const CONFIG_DIR = explicitConfigDir ?? groupworkDir;
