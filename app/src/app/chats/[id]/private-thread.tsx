"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Draft = {
  id: string;
  body: string;
  created_at: string;
  first_viewed_at: string | null;
  sender_type: "human" | "agent";
  topic_tag: string | null;
  question_type: string | null;
  trigger_message_id: string | null;
};

type Props = {
  chatId: string;
  personId: string;
  agentBindingId: string | null; // null if no binding in this chat
};

export default function PrivateThread({ chatId, personId, agentBindingId }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const viewedAtRef = useRef<Record<string, string>>({});
  const supabase = createClient();

  // load existing drafts
  useEffect(() => {
    if (!agentBindingId) return;
    supabase
      .from("private_thread_message")
      .select("id, body, created_at, first_viewed_at, sender_type, topic_tag, question_type, trigger_message_id")
      .eq("chat_id", chatId)
      .eq("person_id", personId)
      .eq("sender_type", "agent")
      .is("resolved_at", null) // only unresolved drafts
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setDrafts(data ?? []);
        // mark unviewed drafts as viewed
        (data ?? []).forEach((d) => {
          if (!d.first_viewed_at) markViewed(d.id);
        });
      });
  }, [chatId, personId, agentBindingId]);

  // realtime: new drafts from agent
  useEffect(() => {
    if (!agentBindingId) return;
    const channel = supabase
      .channel(`private:${chatId}:${personId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "private_thread_message",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        const msg = payload.new as Draft;
        if (msg.sender_type !== "agent") return;
        setDrafts((prev) => [...prev, msg]);
        markViewed(msg.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId, personId, agentBindingId]);

  async function markViewed(draftId: string) {
    const now = new Date().toISOString();
    viewedAtRef.current[draftId] = now;
    await supabase
      .from("private_thread_message")
      .update({ first_viewed_at: now })
      .eq("id", draftId)
      .is("first_viewed_at", null); // only set once
  }

  async function recordEvent(
    draft: Draft,
    signal: string,
    extraFields: Record<string, any> = {}
  ) {
    if (!agentBindingId) return;
    const firstViewed = viewedAtRef.current[draft.id];
    const responseTimeMs = firstViewed
      ? Date.now() - new Date(firstViewed).getTime()
      : null;

    await supabase.from("judgment_event").insert({
      person_id: personId,
      agent_binding_id: agentBindingId,
      private_thread_message_id: draft.id,
      message_id: draft.trigger_message_id,
      signal,
      topic_tag: draft.topic_tag,
      question_type: draft.question_type,
      relationship_category: "internal_team", // MVP default — real relationship_link comes later
      response_time_ms: responseTimeMs,
      ...extraFields,
    });
  }

  function removeDraft(draftId: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }

  async function handleSendAsIs(draft: Draft) {
    setLoading(draft.id);

    // post to group chat
    const { data: msg, error } = await supabase
      .from("message")
      .insert({
        chat_id: chatId,
        sender_person_id: personId,
        sender_type: "agent",
        agent_binding_id: agentBindingId,
        mode: "advice",
        body: draft.body,
      })
      .select()
      .single();

    if (error) {
      console.error("[daemon] Failed to send draft:", error.message);
      setLoading(null);
      return;
    }

    // link draft to the sent message AND mark resolved so it stops
    // showing up in the pending-drafts query
    await supabase
      .from("private_thread_message")
      .update({ draft_for_message_id: msg.id, resolved_at: new Date().toISOString() })
      .eq("id", draft.id);

    await recordEvent(draft, "sent_unedited", { edit_distance: 0 });
    removeDraft(draft.id);
    setLoading(null);
  }

  async function handleSendEdited(draft: Draft) {
    if (!editBody.trim()) return;
    setLoading(draft.id);

    const { data: msg, error } = await supabase
      .from("message")
      .insert({
        chat_id: chatId,
        sender_person_id: personId,
        sender_type: "agent",
        agent_binding_id: agentBindingId,
        mode: "advice",
        body: editBody,
      })
      .select()
      .single();

    if (error) { setLoading(null); return; }

    await supabase
      .from("private_thread_message")
      .update({ draft_for_message_id: msg.id, resolved_at: new Date().toISOString() })
      .eq("id", draft.id);

    // compute edit distance as word count difference (simple proxy)
    const originalWords = draft.body.trim().split(/\s+/).length;
    const editedWords = editBody.trim().split(/\s+/).length;
    const editDistance = Math.abs(originalWords - editedWords);

    await recordEvent(draft, "sent_edited", { edit_distance: editDistance });
    removeDraft(draft.id);
    setEditingId(null);
    setEditBody("");
    setLoading(null);
  }

  async function handleCancel(draft: Draft) {
    setLoading(draft.id);
    await recordEvent(draft, "ignored");
    // mark as resolved so it doesn't show up again
    await supabase
      .from("private_thread_message")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", draft.id);
    removeDraft(draft.id);
    setLoading(null);
  }

  async function handleHandleMyself(draft: Draft) {
    setLoading(draft.id);
    await recordEvent(draft, "handled_manually");
    await supabase
      .from("private_thread_message")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", draft.id);
    removeDraft(draft.id);
    setLoading(null);
  }

  if (!agentBindingId) return null;

  return (
    <div className="border-t border-neutral-800 pt-4 space-y-3">
      <h2 className="text-xs text-neutral-500 uppercase tracking-wide flex items-center gap-2">
        Agent workspace
        {drafts.length > 0 && (
          <span className="bg-neutral-700 text-neutral-200 text-xs px-1.5 py-0.5 rounded-full">
            {drafts.length}
          </span>
        )}
      </h2>

      {drafts.length === 0 && (
        <p className="text-neutral-600 text-xs">
          No pending drafts. Work will appear here for review.
        </p>
      )}

      <div className="space-y-3">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            className="rounded border border-neutral-700 bg-neutral-900 p-3 space-y-2"
          >
            {editingId === draft.id ? (
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm resize-none"
                rows={3}
                autoFocus
              />
            ) : (
              <p className="text-sm text-neutral-200">{draft.body}</p>
            )}

            <div className="flex gap-2 flex-wrap">
              {editingId === draft.id ? (
                <>
                  <button
                    onClick={() => handleSendEdited(draft)}
                    disabled={loading === draft.id}
                    className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-900 font-medium disabled:opacity-50"
                  >
                    Send edited
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditBody(""); }}
                    className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-300"
                  >
                    Cancel edit
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleSendAsIs(draft)}
                    disabled={loading === draft.id}
                    className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-900 font-medium disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => { setEditingId(draft.id); setEditBody(draft.body); }}
                    disabled={loading === draft.id}
                    className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-300 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleHandleMyself(draft)}
                    disabled={loading === draft.id}
                    className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-300 disabled:opacity-50"
                  >
                    I'll handle this
                  </button>
                  <button
                    onClick={() => handleCancel(draft)}
                    disabled={loading === draft.id}
                    className="text-xs text-neutral-600 hover:text-neutral-400 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}