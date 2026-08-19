"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateChatForm({ personId }: { personId: string }) {
  const [name, setName] = useState("");
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
      .insert({ name, is_group: true, created_by: personId })
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
    router.refresh(); // re-fetch server component's chat list
  }

  return (
    <form onSubmit={handleCreate} className="flex gap-2">
      <input
        type="text"
        placeholder="New chat name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="flex-1 rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "..." : "Create"}
      </button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </form>
  );
}
