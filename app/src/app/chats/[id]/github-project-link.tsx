"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, ModalShell, TextInput } from "@/app/ui";

export default function GithubProjectLink({ chatId, initialUrl, isOwner }: {
  chatId: string;
  initialUrl: string | null;
  isOwner: boolean;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [editing, setEditing] = useState(false);
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

  if (!url) {
    if (!isOwner) return null;
    return <>
      <button type="button" onClick={() => { setDraft(""); setError(null); setEditing(true); }} className="text-xs text-neutral-500 transition-colors hover:text-neutral-200">+ add GitHub repository</button>
      {editing && <GithubEditModal />}
    </>;
  }

  return (
    <>
    <div className="flex min-w-0 items-center gap-2 text-xs">
        <span className="text-neutral-600">repo</span>
        <a href={url} target="_blank" rel="noreferrer" className="truncate text-neutral-400 hover:text-neutral-200">{url}</a>
        {isOwner && <button type="button" onClick={() => { setDraft(url); setError(null); setEditing(true); }} className="shrink-0 text-neutral-600 hover:text-neutral-300">edit</button>}
      {error && <span role="alert" className="text-red-400">{error}</span>}
    </div>
    {editing && <GithubEditModal />}
    </>
  );

  function GithubEditModal() {
    return (
      <ModalShell title="GitHub repository" onClose={() => { if (!saving) { setDraft(url); setEditing(false); setError(null); } }}>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4">
          <p className="text-sm leading-5 text-neutral-400">Link the repository for this chat. It will be included in agent prompts; local credentials still control access.</p>
          <TextInput value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" autoFocus />
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="quiet" onClick={() => { setDraft(url); setEditing(false); setError(null); }} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving || !draft.trim()}>{saving ? "Saving…" : "Save repository"}</Button>
          </div>
        </form>
      </ModalShell>
    );
  }
}
