import { createClient } from "@supabase/supabase-js";
import { createServer } from "http";
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import { APP_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const CONFIG_DIR = process.env.DAEMON_CONFIG_DIR ?? join(homedir(), ".daemon");
const AUTH_FILE = join(CONFIG_DIR, "auth.json");
const SETTINGS_FILE = join(CONFIG_DIR, "settings.json");

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function readSession() {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeSession(session) {
  ensureConfigDir();
  writeFileSync(AUTH_FILE, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  }, null, 2), { mode: 0o600 });
  chmodSync(AUTH_FILE, 0o600);
}

export function getConnectorAppUrl() {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf8")).app_url ?? APP_URL;
  } catch {
    return APP_URL;
  }
}

function saveConnectorAppUrl(appUrl) {
  ensureConfigDir();
  writeFileSync(SETTINGS_FILE, JSON.stringify({ app_url: appUrl }, null, 2), { mode: 0o600 });
  chmodSync(SETTINGS_FILE, 0o600);
}

function openBrowser(url) {
  const os = platform();
  const command = os === "darwin" ? "open" : os === "win32" ? "cmd" : "xdg-open";
  const args = os === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {
    console.log(`[daemon] Open this URL in your browser:\n${url}`);
  });
  child.unref();
}

export async function getAuthenticatedClient() {
  const saved = readSession();
  if (!saved?.access_token || !saved?.refresh_token) {
    throw new Error("Not logged in. Run: daemon-connect login");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await supabase.auth.setSession(saved);
  if (error || !data.session) {
    throw new Error(`Saved login is invalid. Run daemon-connect login again. ${error?.message ?? ""}`.trim());
  }
  writeSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) writeSession(session);
  });
  return supabase;
}

export async function login({ timeoutMs = 5 * 60_000, appUrl = getConnectorAppUrl() } = {}) {
  appUrl = new URL(appUrl).origin;
  const state = randomBytes(24).toString("hex");
  const expectedOrigin = appUrl;

  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = (error, value) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else resolve(value);
    };

    const server = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", expectedOrigin);
      response.setHeader("Access-Control-Allow-Headers", "content-type");
      response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Private-Network", "true");
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }
      if (request.method !== "POST" || request.url !== "/callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      if (request.headers.origin !== expectedOrigin) {
        response.writeHead(403).end("Invalid origin");
        return;
      }

      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
        if (body.length > 20_000) request.destroy();
      });
      request.on("end", async () => {
        try {
          const payload = JSON.parse(body);
          if (payload.state !== state) throw new Error("Invalid authorization state");
          if (!payload.access_token || !payload.refresh_token) throw new Error("Missing session tokens");
          const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false },
          });
          const { data, error } = await supabase.auth.setSession({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
          });
          if (error || !data.session || !data.user) throw error ?? new Error("No authenticated user");
          writeSession(data.session);
          saveConnectorAppUrl(appUrl);
          response.writeHead(200, { "Content-Type": "text/plain" }).end("Connector authorized. You can close this tab.");
          finish(null, data.user);
        } catch (error) {
          response.writeHead(400, { "Content-Type": "text/plain" }).end(error.message);
        }
      });
    });

    const timer = setTimeout(() => finish(new Error("Login timed out. Run daemon-connect login again.")), timeoutMs);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const callback = `http://127.0.0.1:${address.port}/callback`;
      const authorizeUrl = new URL("/connector/authorize", appUrl);
      authorizeUrl.searchParams.set("callback", callback);
      authorizeUrl.searchParams.set("state", state);
      console.log("[daemon] Opening groupwork to authorize this connector...");
      console.log(`[daemon] If the browser does not open, visit:\n${authorizeUrl}`);
      openBrowser(authorizeUrl.toString());
    });
    server.on("error", (error) => finish(error));
  });
}

export async function logout() {
  try {
    const supabase = await getAuthenticatedClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Removing the local session remains useful even if it has expired.
  }
  if (existsSync(AUTH_FILE)) unlinkSync(AUTH_FILE);
}

export function hasSavedLogin() {
  const saved = readSession();
  return Boolean(saved?.access_token && saved?.refresh_token);
}

export { AUTH_FILE };
