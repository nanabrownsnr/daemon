"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Member = { id: string; display_name: string };

export default function MembersList({
  chatId,
  members,
  myPersonId,
  isOwner,
}: {
  chatId: string;
  members: Member[];
  myPersonId: string;
  isOwner: boolean;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleKick(memberId: string) {
    if (!confirm("Remove this person from the chat?")) return;
    setRemoving(memberId);
    await supabase.from("chat_member").delete().eq("chat_id", chatId).eq("person_id", memberId);
    setRemoving(null);
    router.refresh();
  }

  return (
    <ul className="space-y-2">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-2 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0" />
          <span className="text-neutral-400 truncate flex-1 min-w-0">
            {m.display_name}
            {m.id === myPersonId && <span className="text-neutral-600 ml-1 text-xs">you</span>}
          </span>
          {isOwner && m.id !== myPersonId && (
            <button
              onClick={() => handleKick(m.id)}
              disabled={removing === m.id}
              title="Remove from chat"
              className="text-neutral-600 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0 text-xs"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}