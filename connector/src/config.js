import "dotenv/config";

export const SUPABASE_URL = process.env.DAEMON_SUPABASE_URL
  ?? "https://xavdpkbsgjtygbdksway.supabase.co";
export const SUPABASE_ANON_KEY = process.env.DAEMON_SUPABASE_ANON_KEY
  ?? "sb_publishable_BrvEcbV07527ToCIwjbKbQ_cHwBZ8eH";
export const APP_URL = (process.env.DAEMON_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
