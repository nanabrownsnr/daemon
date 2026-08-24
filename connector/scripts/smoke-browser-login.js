// Local-only smoke test for the browser-to-loopback authorization protocol.
// This file is excluded from the published package.
import { spawn } from "child_process";
import { statSync } from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const email = process.env.GROUPWORK_EMAIL;
const password = process.env.GROUPWORK_PASSWORD;
const supabaseUrl = process.env.GROUPWORK_SUPABASE_URL;
const supabaseKey = process.env.GROUPWORK_SUPABASE_ANON_KEY;
const configDir = process.env.GROUPWORK_CONFIG_DIR;

if (!email || !password || !supabaseUrl || !supabaseKey || !configDir) {
  throw new Error("Smoke test requires the existing local connector .env and GROUPWORK_CONFIG_DIR.");
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data.session) throw error ?? new Error("Could not create smoke-test browser session");

const child = spawn(process.execPath, ["src/cli.js", "login"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, GROUPWORK_CONFIG_DIR: configDir, GROUPWORK_APP_URL: "http://localhost:3000" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let sent = false;
child.stdout.on("data", async (chunk) => {
  output += chunk.toString();
  const match = output.match(/http:\/\/localhost:3000\/connector\/authorize\?[^\s]+/);
  if (!match || sent) return;
  sent = true;
  const authorizeUrl = new URL(match[0]);
  const callback = authorizeUrl.searchParams.get("callback");
  const state = authorizeUrl.searchParams.get("state");
  const response = await fetch(callback, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({
      state,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }),
  });
  if (!response.ok) child.kill();
});
child.stderr.pipe(process.stderr);

const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0 || !output.includes("Authorized as")) {
  throw new Error(`Connector login smoke test failed with exit code ${exitCode}`);
}

const mode = statSync(`${configDir}/auth.json`).mode & 0o777;
if (mode !== 0o600) throw new Error(`Expected auth.json mode 600, received ${mode.toString(8)}`);
console.log("Browser authorization smoke test passed; auth.json permissions are 600.");
