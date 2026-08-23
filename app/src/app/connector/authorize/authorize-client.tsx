"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "sending" | "done" | "error" | "signed-out";

export default function AuthorizeConnector({
  callback,
  state,
  loginPath,
}: {
  callback: string;
  state: string;
  loginPath: string;
}) {
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!active) return;
      if (userError || !data.user) {
        setStatus("signed-out");
        return;
      }
      setEmail(data.user.email ?? null);
      setStatus("ready");
    });
    return () => { active = false; };
  }, [supabase]);

  async function authorize() {
    setStatus("sending");
    setError(null);
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) {
      setError("Your login session is unavailable. Log in again and retry.");
      setStatus("error");
      return;
    }

    try {
      const response = await fetch(callback, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatus("done");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not reach the connector on this computer.");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
      {status === "checking" && <p className="text-sm text-neutral-400">Checking your login…</p>}
      {status === "signed-out" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">Log in before authorizing the connector.</p>
          <a href={loginPath} className="inline-block rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900">Log in</a>
        </div>
      )}
      {(status === "ready" || status === "sending" || status === "error") && (
        <div className="space-y-4">
          <div>
            <p className="font-medium">Authorize this computer?</p>
            <p className="mt-1 text-sm text-neutral-500">Signed in as {email}. Only approve a connector command you started yourself.</p>
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button onClick={authorize} disabled={status === "sending"} className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50">
            {status === "sending" ? "Authorizing…" : "Authorize connector"}
          </button>
        </div>
      )}
      {status === "done" && (
        <div className="space-y-2">
          <p className="font-medium text-green-400">Connector authorized</p>
          <p className="text-sm text-neutral-400">Return to your terminal and run groupwork-connect doctor.</p>
        </div>
      )}
    </div>
  );
}
