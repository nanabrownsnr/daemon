"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // this is what fixes the email-fallback issue we logged earlier —
          // the auth->person trigger reads this metadata directly
          data: { display_name: displayName },
        },
      });
      if (error) setError(error.message);
      else router.push("/chats");
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setError(error.message);
      else router.push("/chats");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-semibold">dæmon</h1>

        <div className="flex gap-4 text-sm">
          <button
            className={mode === "signup" ? "font-semibold" : "text-neutral-500"}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
          <button
            className={mode === "login" ? "font-semibold" : "text-neutral-500"}
            onClick={() => setMode("login")}
          >
            Log in
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
              className="w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

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
