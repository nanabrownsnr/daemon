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
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  function openConfirmation(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setConfirming(true);
  }

  async function handleAction() {
    setLoading(true);
    setError(null);

    const { error: actionError } = isOwner
      ? await supabase.from("chat").delete().eq("id", chatId)
      : await supabase
          .from("chat_member")
          .delete()
          .eq("chat_id", chatId)
          .eq("person_id", personId);

    if (actionError) {
      setError(actionError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setConfirming(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={openConfirmation}
        disabled={loading}
        title={isOwner ? "Delete chat" : "Leave chat"}
        aria-label={isOwner ? "Delete chat" : "Leave chat"}
        className="rounded-lg p-2 text-neutral-600 hover:bg-red-950/40 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
      >
        {isOwner ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          </svg>
        )}
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !loading && setConfirming(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`chat-action-title-${chatId}`}
            className="relative w-full max-w-sm space-y-4 rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
          >
            <div>
              <h2 id={`chat-action-title-${chatId}`} className="font-medium text-neutral-100">
                {isOwner ? "Delete chat?" : "Leave chat?"}
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                {isOwner
                  ? "This deletes the chat for everyone and cannot be undone."
                  : "You will lose access to this chat."}
              </p>
            </div>

            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAction}
                disabled={loading}
                className="rounded bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-50"
              >
                {loading ? (isOwner ? "Deleting..." : "Leaving...") : (isOwner ? "Delete" : "Leave")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
