"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GithubProjectLink({ chatId, initialUrl, isOwner }: {
  chatId: string;
  initialUrl: string | null;
  isOwner: boolean;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [editing, setEditing] = useState(!initialUrl && isOwner);
  const [draft, setDraft] = useState(initialUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function save() {
    setSaving(true);
    setError(null);
    const { data, error: saveError } = await supabase.rpc("set_chat_github_url", {
      p_chat_id: chatId,
      p_github_url: draft,
    });
    if (saveError || !data) {
      setError(saveError?.message ?? "Could not save the repository link.");
      setSaving(false);
      return;
    }
    setUrl((data as { github_url: string | null }).github_url ?? "");
    setEditing(false);
    setSaving(false);
  }

  if (!editing && !url) {
    if (!isOwner) return null;
    return <button type="button" onClick={() => setEditing(true)} className="text-xs text-neutral-500 hover:text-neutral-300">+ add GitHub repository</button>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      {editing ? <>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300 outline-none focus:border-neutral-500" />
        <button type="button" onClick={() => void save()} disabled={saving} className="text-neutral-300 hover:text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => { setDraft(url); setEditing(false); setError(null); }} disabled={saving} className="text-neutral-600 hover:text-neutral-400">Cancel</button>
      </> : <>
        <span className="text-neutral-600">repo</span>
        <a href={url} target="_blank" rel="noreferrer" className="truncate text-neutral-400 hover:text-neutral-200">{url}</a>
        {isOwner && <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-neutral-600 hover:text-neutral-300">edit</button>}
      </>}
      {error && <span role="alert" className="text-red-400">{error}</span>}
    </div>
  );
}
