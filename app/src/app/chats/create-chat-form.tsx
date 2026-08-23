"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateChatForm({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [chatType, setChatType] = useState<"team" | "solo">("team");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: chat, error: chatError } = await supabase
      .from("chat")
      .insert({ name, is_group: chatType === "team", created_by: personId })
      .select()
      .single();

    if (chatError || !chat) {
      setError(chatError?.message ?? "Failed to create chat");
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("chat_member").insert({
      chat_id: chat.id,
      person_id: personId,
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    setName("");
    setLoading(false);
    setOpen(false);
    router.push(`/chats/${chat.id}`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null); }}
        className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
      >
        + new chat
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="new-chat-title" className="relative w-full max-w-sm space-y-4 rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 id="new-chat-title" className="font-medium">New chat</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-lg leading-none text-neutral-500 hover:text-neutral-300">×</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <fieldset className="space-y-2 text-sm">
                <legend className="text-xs text-neutral-500">Chat type</legend>
                <label className="flex items-center gap-2 text-neutral-300">
                  <input type="radio" name="chat-type" value="solo" checked={chatType === "solo"} onChange={() => setChatType("solo")} className="accent-neutral-100" />
                  Solo <span className="text-xs text-neutral-600">you coordinate your agents</span>
                </label>
                <label className="flex items-center gap-2 text-neutral-300">
                  <input type="radio" name="chat-type" value="team" checked={chatType === "team"} onChange={() => setChatType("team")} className="accent-neutral-100" />
                  Teams <span className="text-xs text-neutral-600">everyone brings their agent</span>
                </label>

              </fieldset>

              <div>
                <label htmlFor="new-chat-name" className="mb-1 block text-xs text-neutral-500">Name</label>
                <input
                  id="new-chat-name"
                  type="text"
                  placeholder="Chat name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">Cancel</button>
                <button type="submit" disabled={loading} className="rounded bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 disabled:opacity-50">
                  {loading ? "..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
