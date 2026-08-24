#!/usr/bin/env node
import { start, pause, resume } from "./connector.js";
import { login, logout } from "./auth.js";
import { doctor } from "./doctor.js";

const command = process.argv[2];
const appUrlIndex = process.argv.indexOf("--app-url");
const appUrl = appUrlIndex >= 0 ? process.argv[appUrlIndex + 1] : undefined;

async function main() {
  switch (command) {
    case "login": {
      const user = await login({ appUrl });
      console.log(`[groupwork] Authorized as ${user.email}.`);
      break;
    }
    case "logout":
      await logout();
      console.log("[groupwork] Logged out on this computer.");
      break;
    case "doctor": {
      const ok = await doctor();
      if (!ok) process.exitCode = 1;
      break;
    }
    case "start":
      await start();
      break;
    case "pause":
      pause();
      break;
    case "resume":
      resume();
      break;
    default:
      console.log(`
groupwork connector

Usage:
  groupwork-connect login [--app-url URL]  Authorize this computer in your browser
  groupwork-connect doctor  Check login, agents, bindings, and project paths
  groupwork-connect start   Start the connector
  groupwork-connect pause   Pause mention processing
  groupwork-connect resume  Resume mention processing
  groupwork-connect logout  Remove the saved login from this computer

Run login first. Your groupwork password is never stored by the connector.
      `);
  }
}

main().catch((error) => {
  console.error(`[groupwork] ${error.message}`);
  process.exitCode = 1;
});
