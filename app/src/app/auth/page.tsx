"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SiteHeader from "../site-header";

export default function AuthPage() {
  const [mode, setMode] = useState<"signup" | "login">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function destinationAfterLogin(needsConnectorOnboarding = false) {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/") && !next.startsWith("//")) return next;
    return needsConnectorOnboarding ? "/connector" : "/chats";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setStatus(null);
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    if (mode === "signup") {
      const normalizedDisplayName = displayName.trim();
      if (!normalizedDisplayName) {
        setError("Display name is required.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          // this is what fixes the email-fallback issue we logged earlier —
          // the auth->person trigger reads this metadata directly
          data: {
            display_name: normalizedDisplayName,
            needs_connector_onboarding: true,
          },
        },
      });
      if (error) setError(error.message);
      else if (data.session) {
        router.replace(destinationAfterLogin(true));
        router.refresh();
      } else {
        setStatus("Account created. Check your email to confirm your address, then log in.");
        setMode("login");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) setError(error.message);
      else {
        router.replace(destinationAfterLogin(data.user?.user_metadata.needs_connector_onboarding === true));
        router.refresh();
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <SiteHeader>
        <Link href="/about" className="transition-colors hover:text-neutral-300">about</Link>
      </SiteHeader>
      <div className="mx-auto w-full max-w-sm space-y-6 px-8 pb-12 pt-8 sm:pt-12">
        <h1 className="text-2xl font-semibold">Welcome</h1>

        <div className="flex gap-4 text-sm">
          <button
            type="button"
            className={mode === "login" ? "font-semibold" : "text-neutral-500"}
            onClick={() => { setMode("login"); setError(null); setStatus(null); }}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "font-semibold" : "text-neutral-500"}
            onClick={() => { setMode("signup"); setError(null); setStatus(null); }}
          >
            Sign up
          </button>

        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={80}
              autoComplete="name"
              className="w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "signup" ? 8 : 6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {status && <p className="text-green-400 text-sm">{status}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-neutral-100 text-neutral-900 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "..." : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
