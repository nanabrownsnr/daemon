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
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleKick() {
    if (!memberToRemove) return;
    setRemoving(memberToRemove.id);
    setError(null);
    const { error: removeError } = await supabase
      .from("chat_member")
      .delete()
      .eq("chat_id", chatId)
      .eq("person_id", memberToRemove.id);

    if (removeError) {
      setError(removeError.message);
      setRemoving(null);
      return;
    }

    setRemoving(null);
    setMemberToRemove(null);
    router.refresh();
  }

  return (
    <>
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
                onClick={() => { setMemberToRemove(m); setError(null); }}
                disabled={removing === m.id}
                title="Remove from chat"
                aria-label={`Remove ${m.display_name} from chat`}
                className="text-neutral-600 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0 text-xs"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => removing === null && setMemberToRemove(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-member-title"
            className="relative w-full max-w-sm space-y-4 rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
          >
            <div>
              <h2 id="remove-member-title" className="font-medium text-neutral-100">Remove member?</h2>
              <p className="mt-2 text-sm text-neutral-400">
                {memberToRemove.display_name} will lose access to this chat.
              </p>
            </div>

            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                disabled={removing !== null}
                className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleKick}
                disabled={removing !== null}
                className="rounded bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-50"
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
