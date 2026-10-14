"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import MessageMarkdown from "./message-markdown";
import { useAgentPresence } from "./agent-presence";

type Draft = {
  id: string;
  body: string;
  created_at: string;
  first_viewed_at: string | null;
  sender_type: "human" | "agent";
  topic_tag: string | null;
  question_type: string | null;
  trigger_message_id: string | null;
  agent_binding_id: string | null;
  is_error: boolean;
};

type AgentBinding = {
  id: string;
  agent_type: string;
  agent_label: string | null;
};

type RunRequest = {
  id: string;
  status: "pending" | "approved" | "running" | "completed" | "failed" | "rejected";
  permission: "full_access";
  created_at: string;
  agent_binding_id: string;
  message: {
    body: string;
    sender: { display_name: string } | null;
  } | null;
};

type Props = {
  chatId: string;
  personId: string;
  agentBindings: AgentBinding[];
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex_cli: "Codex CLI",
};

function mergeDrafts(current: Draft[], incoming: Draft[]) {
  const byId = new Map(current.map((draft) => [draft.id, draft]));
  for (const draft of incoming) byId.set(draft.id, draft);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export default function PrivateThread({ chatId, personId, agentBindings }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [runRequests, setRunRequests] = useState<RunRequest[]>([]);
  const [selectedBindingId, setSelectedBindingId] = useState(agentBindings[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { workingBindings, workingDestinations } = useAgentPresence();
  const viewedAtRef = useRef<Record<string, string>>({});
  const supabase = createClient();
  const bindingKey = agentBindings.map((binding) => binding.id).join(",");
  const activeBindingId = agentBindings.some((binding) => binding.id === selectedBindingId)
    ? selectedBindingId
    : agentBindings[0]?.id ?? null;

  const markViewed = useCallback(async (draftId: string) => {
    const now = new Date().toISOString();
    viewedAtRef.current[draftId] = now;
    await supabase
      .from("private_thread_message")
      .update({ first_viewed_at: now })
      .eq("id", draftId)
      .is("first_viewed_at", null);
  }, [supabase]);

  // load existing drafts
  useEffect(() => {
    if (agentBindings.length === 0) return;
    supabase
      .from("private_thread_message")
      .select("id, body, created_at, first_viewed_at, sender_type, topic_tag, question_type, trigger_message_id, agent_binding_id, is_error")
      .eq("chat_id", chatId)
      .eq("person_id", personId)
      .eq("sender_type", "agent")
      .is("resolved_at", null) // only unresolved drafts
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setDrafts((previous) => mergeDrafts(previous, data ?? []));
      });
  }, [chatId, personId, bindingKey, agentBindings.length, supabase]);

  // Team work does not reach a local agent until its owner approves it here.
  useEffect(() => {
    if (agentBindings.length === 0) return;
    supabase
      .from("agent_run_request")
      .select("id, status, permission, created_at, agent_binding_id, message:message_id(body, sender:sender_person_id(display_name))")
      .eq("owner_person_id", personId)
      .in("status", ["pending", "approved", "running", "failed"])
      .order("created_at", { ascending: true })
      .then(({ data }) => setRunRequests((data ?? []) as unknown as RunRequest[]));
  }, [personId, bindingKey, agentBindings.length, supabase]);

  useEffect(() => {
    if (agentBindings.length === 0) return;
    const channel = supabase
      .channel(`agent-runs:${personId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "agent_run_request",
        filter: `owner_person_id=eq.${personId}`,
      }, (payload) => {
        const changed = (payload.new ?? payload.old) as RunRequest;
        if (!changed?.id) return;
        if (changed.status === "completed" || changed.status === "rejected") {
          setRunRequests((previous) => previous.filter((request) => request.id !== changed.id));
          return;
        }
        // Re-fetch to retain the joined message and sender information.
        supabase
          .from("agent_run_request")
          .select("id, status, permission, created_at, agent_binding_id, message:message_id(body, sender:sender_person_id(display_name))")
          .eq("id", changed.id)
          .single()
          .then(({ data }) => {
            if (!data) return;
            const request = data as unknown as RunRequest;
            setRunRequests((previous) => [
              ...previous.filter((item) => item.id !== request.id),
              request,
            ].sort((a, b) => a.created_at.localeCompare(b.created_at)));
          });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [personId, bindingKey, agentBindings.length, supabase]);

  // realtime: new drafts from agent
  useEffect(() => {
    if (agentBindings.length === 0) return;
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
        if (msg.agent_binding_id && !agentBindings.some((binding) => binding.id === msg.agent_binding_id)) return;
        setDrafts((prev) => mergeDrafts(prev, [msg]));
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "private_thread_message",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        const msg = payload.new as Draft & { resolved_at?: string | null };
        if (msg.resolved_at) {
          setDrafts((prev) => prev.filter((draft) => draft.id !== msg.id));
          return;
        }
        setDrafts((prev) => mergeDrafts(prev, [msg]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId, personId, bindingKey, agentBindings, supabase]);

  const visibleDrafts = drafts.filter((draft) =>
    draft.agent_binding_id === activeBindingId
      || (agentBindings.length === 1 && draft.agent_binding_id === null)
  );
  const activeAgentWorking = activeBindingId
    ? workingBindings.has(activeBindingId) && workingDestinations.get(activeBindingId) === "private"
    : false;

  useEffect(() => {
    visibleDrafts.forEach((draft) => {
      if (!draft.first_viewed_at && !viewedAtRef.current[draft.id]) void markViewed(draft.id);
    });
  }, [visibleDrafts, markViewed]);

  async function recordEvent(
    draft: Draft,
    signal: string,
    extraFields: Record<string, string | number | boolean | null> = {}
  ) {
    const bindingId = draft.agent_binding_id ?? activeBindingId;
    if (!bindingId) return;
    const firstViewed = viewedAtRef.current[draft.id];
    const responseTimeMs = firstViewed
      ? new Date().getTime() - new Date(firstViewed).getTime()
      : null;

    await supabase.from("judgment_event").insert({
      person_id: personId,
      agent_binding_id: bindingId,
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

  async function decideRunRequest(
    request: RunRequest,
    decision: "approve" | "reject",
    permission: "full_access" = "full_access"
  ) {
    setLoading(request.id);
    setRequestError(null);
    const { data, error } = await supabase.rpc("decide_agent_run_request", {
      p_request_id: request.id,
      p_decision: decision,
      p_permission: permission,
    });
    if (error) {
      setRequestError(error.message);
      setLoading(null);
      return;
    }
    if (decision === "reject") {
      setRunRequests((previous) => previous.filter((item) => item.id !== request.id));
    } else {
      const decided = data as RunRequest;
      setRunRequests((previous) => previous.map((item) =>
        item.id === request.id ? { ...item, status: decided.status, permission: decided.permission } : item
      ));
    }
    setLoading(null);
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
        agent_binding_id: draft.agent_binding_id ?? activeBindingId,
        mode: "advice",
        body: draft.body,
        topic_tag: draft.topic_tag,
      })
      .select()
      .single();

    if (error) {
      console.error("[groupwork] Failed to send draft:", error.message);
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
        agent_binding_id: draft.agent_binding_id ?? activeBindingId,
        mode: "advice",
        body: editBody,
        was_edited: true,
        topic_tag: draft.topic_tag,
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

  async function dismissError(draft: Draft) {
    setLoading(draft.id);
    const { error } = await supabase
      .from("private_thread_message")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", draft.id);
    if (error) {
      setRequestError(`Could not dismiss connector error: ${error.message}`);
      setLoading(null);
      return;
    }
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

  if (agentBindings.length === 0 || !activeBindingId) return null;

  return (
    <section className="space-y-3 p-4">
      <h2 className="text-xs text-neutral-500 uppercase tracking-wide flex items-center gap-2">
        Agent Workspace
        {visibleDrafts.length + runRequests.length > 0 && (
          <span className="bg-neutral-700 text-neutral-200 text-xs px-1.5 py-0.5 rounded-full">
            {visibleDrafts.length + runRequests.length}
          </span>
        )}
      </h2>

      {agentBindings.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {agentBindings.map((binding) => {
            const count = drafts.filter((draft) => draft.agent_binding_id === binding.id).length;
            return (
              <button
                key={binding.id}
                type="button"
                onClick={() => setSelectedBindingId(binding.id)}
                className={`rounded px-2 py-1 text-xs transition-colors ${activeBindingId === binding.id ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                {binding.agent_label ?? binding.agent_type}
                <span className="ml-1 text-neutral-500">· {AGENT_TYPE_LABELS[binding.agent_type] ?? binding.agent_type}</span>
                {count > 0 && <span className="ml-1 text-neutral-400">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {requestError && <p className="text-xs text-red-400">{requestError}</p>}

      {runRequests.length > 0 && (
        <div className="space-y-3">
          {runRequests.map((request) => {
            const binding = agentBindings.find((item) => item.id === request.agent_binding_id);
            const label = binding?.agent_label ?? (binding ? AGENT_TYPE_LABELS[binding.agent_type] : null) ?? "Agent";
            return (
              <div key={request.id} className="rounded border border-amber-900/60 bg-amber-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-amber-400">Run request · {label}</span>
                  {request.status !== "pending" && (
                    <span className="text-xs capitalize text-neutral-500">{request.status.replace("_", " ")}</span>
                  )}
                </div>
                <p className="text-xs text-neutral-500">From {request.message?.sender?.display_name ?? "a teammate"}</p>
                <div className="text-sm text-neutral-200">
                  <MessageMarkdown compact>{request.message?.body ?? "Requested agent work"}</MessageMarkdown>
                </div>
                {(request.status === "pending" || request.status === "failed") && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-300/80">
                      Accepting runs this request with your local agent&apos;s full terminal permissions.
                    </p>
                    <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => decideRunRequest(request, "approve", "full_access")}
                      disabled={loading === request.id}
                      className="rounded bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-900 disabled:opacity-50"
                    >
                      {request.status === "failed" ? "Retry" : "Accept"}
                    </button>
                    <button
                      type="button"
                      onClick={() => decideRunRequest(request, "reject")}
                      disabled={loading === request.id}
                      className="px-1 py-1 text-xs text-neutral-600 hover:text-neutral-400 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {visibleDrafts.length === 0 && runRequests.length === 0 && !activeAgentWorking && (
        <p className="text-neutral-600 text-xs">
          No pending drafts. Mentions of you will appear here for review.
        </p>
      )}

      <div className="space-y-3">
        {activeAgentWorking && (
          <div
            className="flex w-fit items-center gap-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3"
            role="status"
            aria-label="Agent is working"
          >
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400"
                style={{ animationDelay: `${index * 140}ms` }}
              />
            ))}
          </div>
        )}
        {visibleDrafts.map((draft) => (
          <div
            key={draft.id}
            className={`rounded border p-3 space-y-2 ${draft.is_error ? "border-red-900/70 bg-red-950/20" : "border-neutral-700 bg-neutral-900"}`}
          >
            {draft.is_error && (
              <p className="text-xs font-medium text-red-300">
                Connector error · {AGENT_TYPE_LABELS[agentBindings.find((binding) => binding.id === draft.agent_binding_id)?.agent_type ?? ""] ?? "Agent"}
              </p>
            )}
            {editingId === draft.id ? (
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm resize-none"
                rows={3}
                autoFocus
              />
            ) : (
              <div className="text-sm text-neutral-200">
                <MessageMarkdown compact>{draft.body}</MessageMarkdown>
              </div>
            )}

            {draft.is_error ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-red-200/70">This mention was not processed. Fix the connector issue, then send a new mention to retry.</p>
                <button
                  type="button"
                  onClick={() => void dismissError(draft)}
                  disabled={loading === draft.id}
                  className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            ) : <div className="flex gap-2 flex-wrap">
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
                    I&apos;ll handle this
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
            </div>}
          </div>
        ))}
      </div>
    </section>
  );
}
