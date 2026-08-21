"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ChatCardAction({
  chatId,
  isOwner,
  personId,
}: {
  chatId: string;
  isOwner: boolean;
  personId: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this chat for everyone? This cannot be undone.")) return;
    setLoading(true);
    await supabase.from("chat").delete().eq("id", chatId);
    setLoading(false);
    router.refresh();
  }

  async function handleLeave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Leave this chat?")) return;
    setLoading(true);
    await supabase.from("chat_member").delete().eq("chat_id", chatId).eq("person_id", personId);
    setLoading(false);
    router.refresh();
  }

  if (isOwner) {
    return (
      <button
        onClick={handleDelete}
        disabled={loading}
        title="Delete chat"
        aria-label="Delete chat"
        className="rounded-lg p-2 text-neutral-600 hover:bg-red-950/40 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={handleLeave}
      disabled={loading}
      title="Leave chat"
      aria-label="Leave chat"
      className="rounded-lg p-2 text-neutral-600 hover:bg-red-950/40 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      </svg>
    </button>
  );
}
