#!/usr/bin/env node
import { start, pause, resume } from "./connector.js";

const command = process.argv[2];

switch (command) {
  case "start":
    start();
    break;
  case "pause":
    pause();
    break;
  case "resume":
    resume();
    break;
  default:
    console.log(`
dæmon connector

Usage:
  daemon-connect start    Start the connector
  daemon-connect pause    Pause — mentions received but not processed
  daemon-connect resume   Resume processing mentions

Config:
  Copy .env.example to .env and fill in your Supabase credentials.
  Make sure your agent CLI (claude, codex, goose) is authenticated
  on this machine before running start.
    `);
}