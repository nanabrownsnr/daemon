"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import MessageMarkdown from "./message-markdown";

type Message = {
  id: string;
  sender_person_id: string;
  sender_type: "human" | "agent";
  body: string;
  created_at: string;
  was_edited?: boolean;
  agent_binding_id: string | null;
  topic_tag: string | null;
  response_status?: "streaming" | "completed" | "failed";
  stream_sequence?: number;
};

type Person = {
  id: string;
  display_name: string;
};

type AgentBinding = {
  id: string;
  person_id: string;
  agent_type: string;
  agent_label: string | null;
};

type MentionTarget = {
  id: string;
  label: string;
  kind: "person" | "agent";
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex_cli: "Codex CLI",
};

function wordEditDistance(original: string, edited: string) {
  const a = original.trim().split(/\s+/).filter(Boolean);
  const b = edited.trim().split(/\s+/).filter(Boolean);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

export default function ChatMessages({
  chatId,
  personId,
  personNames,
  chatMembers,
  isSolo,
  agentBindings,
}: {
  chatId: string;
  personId: string;
  personNames: Record<string, string>;
  chatMembers: Person[];
  isSolo: boolean;
  agentBindings: AgentBinding[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [mentionedPersonIds, setMentionedPersonIds] = useState<string[]>([]);
  const [mentionedAgentBindingIds, setMentionedAgentBindingIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const mentionTargets: MentionTarget[] = isSolo
    ? agentBindings.map((binding) => ({
        id: binding.id,
        label: binding.agent_label ?? AGENT_TYPE_LABELS[binding.agent_type] ?? binding.agent_type,
        kind: "agent" as const,
      }))
    : chatMembers.map((person) => ({ id: person.id, label: person.display_name, kind: "person" as const }));

  const filteredTargets = mentionQuery !== null
    ? mentionTargets.filter((target) =>
        target.label.toLowerCase().startsWith(mentionQuery.toLowerCase())
      )
    : [];

  const agentNames = Object.fromEntries(agentBindings.map((binding) => [
    binding.id,
    binding.agent_label ?? AGENT_TYPE_LABELS[binding.agent_type] ?? binding.agent_type,
  ]));

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("message")
      .select("id, sender_person_id, sender_type, body, created_at, was_edited, agent_binding_id, topic_tag, response_status, stream_sequence")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));
  }, [chatId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "message",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => setMessages((prev) => [...prev, payload.new as Message]))
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "message",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => setMessages((prev) =>
        prev.map((message) => message.id === payload.new.id ? payload.new as Message : message)
      ))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setDraft(value);

    const textUpToCursor = value.slice(0, cursor);
    const atIndex = textUpToCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const query = textUpToCursor.slice(atIndex + 1);
      if (!query.includes(" ")) {
        setHighlightedIndex(0);
        setMentionQuery(query);
        setMentionStartIndex(atIndex);
        return;
      }
    }
    setMentionQuery(null);
    setMentionStartIndex(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionQuery === null || filteredTargets.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % filteredTargets.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + filteredTargets.length) % filteredTargets.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handlePickMention(filteredTargets[highlightedIndex]);
    } else if (e.key === "Escape") {
      setMentionQuery(null);
      setMentionStartIndex(null);
    }
  }

  function handlePickMention(target: MentionTarget) {
    if (mentionStartIndex === null) return;
    const before = draft.slice(0, mentionStartIndex);
    const after = draft.slice(mentionStartIndex + 1 + (mentionQuery?.length ?? 0));
    setDraft(`${before}@${target.label} ${after}`);
    if (target.kind === "agent") {
      setMentionedAgentBindingIds((prev) => prev.includes(target.id) ? prev : [...prev, target.id]);
    } else {
      setMentionedPersonIds((prev) => prev.includes(target.id) ? prev : [...prev, target.id]);
    }
    setMentionQuery(null);
    setMentionStartIndex(null);
    inputRef.current?.focus();
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSendError(null);

    const body = draft;
    const personMentions = mentionedPersonIds;
    const agentMentions = mentionedAgentBindingIds;
    setDraft("");
    setMentionedPersonIds([]);
    setMentionedAgentBindingIds([]);

    const { data: msg, error } = await supabase.rpc("send_message_with_mentions", {
      p_chat_id: chatId,
      p_body: body,
      p_person_mentions: personMentions,
      p_agent_mentions: agentMentions,
    });

    if (error || !msg) {
      setDraft(body);
      setMentionedPersonIds(personMentions);
      setMentionedAgentBindingIds(agentMentions);
      setSendError(error?.message ?? "Could not send this message.");
      return;
    }

  }

  function beginEdit(message: Message) {
    setEditingMessageId(message.id);
    setEditedBody(message.body);
    setEditError(null);
  }

  async function saveEdit(message: Message) {
    const body = editedBody.trim();
    if (!body || body === message.body || !message.agent_binding_id) return;

    setSavingEdit(true);
    setEditError(null);
    const editDistance = wordEditDistance(message.body, body);

    const { data: updated, error: updateError } = await supabase.rpc("edit_agent_message", {
      p_message_id: message.id,
      p_body: body,
      p_edit_distance: editDistance,
    });

    if (updateError || !updated) {
      setEditError(updateError?.message ?? "Could not edit this message.");
      setSavingEdit(false);
      return;
    }

    const updatedMessage = updated as Message;
    setMessages((prev) => prev.map((item) => item.id === updatedMessage.id ? updatedMessage : item));
    setEditingMessageId(null);
    setEditedBody("");
    setSavingEdit(false);
  }

  const isMyMessage = (m: Message) => m.sender_person_id === personId;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2 chat-scroll">
        {messages.map((m) => {
          const authoredByMe = isMyMessage(m);
          const alignRight = authoredByMe && (!isSolo || m.sender_type === "human");
          const senderLabel = m.sender_type === "agent"
            ? agentNames[m.agent_binding_id ?? ""] ?? `${personNames[m.sender_person_id] ?? "Unknown"} (agent)`
            : personNames[m.sender_person_id] ?? "Unknown";

          return (
            <div key={m.id} className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] space-y-0.5 ${alignRight ? "items-end" : "items-start"} flex flex-col`}>
                {!alignRight && (
                  <span className="text-xs text-neutral-500 px-1">{senderLabel}</span>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm ${
                  alignRight
                    ? "bg-neutral-100 text-neutral-900 rounded-br-sm"
                    : "bg-neutral-800 text-neutral-100 rounded-bl-sm"
                }`}>
                  {editingMessageId === m.id ? (
                    <div className="space-y-2 min-w-64">
                      <textarea
                        value={editedBody}
                        onChange={(event) => setEditedBody(event.target.value)}
                        rows={4}
                        autoFocus
                        className="w-full resize-y rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:outline-none focus:border-neutral-500"
                      />
                      {editError && <p className="text-xs text-red-600">{editError}</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingMessageId(null); setEditedBody(""); setEditError(null); }}
                          disabled={savingEdit}
                          className="text-xs text-neutral-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(m)}
                          disabled={savingEdit || !editedBody.trim() || editedBody.trim() === m.body}
                          className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                        >
                          {savingEdit ? "Saving…" : "Save edit"}
                        </button>
                      </div>
                    </div>
                  ) : m.response_status === "streaming" ? (
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {m.body || "Agent is working…"}
                      <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60" />
                    </p>
                  ) : (
                    <MessageMarkdown>{m.body || "No response was produced."}</MessageMarkdown>
                  )}
                </div>
                {m.sender_type === "agent" && (
                  <div className="flex items-center gap-1 px-1 text-neutral-600">
                    <span className="text-xs italic">
                      {m.response_status === "streaming"
                        ? "Streaming response"
                        : m.response_status === "failed"
                          ? "Agent response failed"
                          : m.was_edited
                        ? `Edited by ${personNames[m.sender_person_id] ?? "Unknown"}`
                        : `Sent by ${agentNames[m.agent_binding_id ?? ""] ?? `${personNames[m.sender_person_id] ?? "Unknown"}'s agent`}`}
                    </span>
                    {authoredByMe && editingMessageId !== m.id && (m.response_status ?? "completed") === "completed" && (
                      <button
                        type="button"
                        onClick={() => beginEdit(m)}
                        title="Edit agent message"
                        aria-label="Edit agent message"
                        className="hover:text-neutral-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* @ mention dropdown */}
      {mentionQuery !== null && filteredTargets.length > 0 && (
        <div className="mx-4 mb-1 border border-neutral-700 rounded-lg bg-neutral-900 overflow-hidden shadow-lg">
          {filteredTargets.map((target, i) => (
            <button
              key={`${target.kind}:${target.id}`}
              type="button"
              onClick={() => handlePickMention(target)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                i === highlightedIndex ? "bg-neutral-700" : "hover:bg-neutral-800"
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-medium shrink-0">
                {target.label[0].toUpperCase()}
              </span>
              <span>{target.label}</span>
              <span className="ml-auto text-xs text-neutral-600">{target.kind}</span>
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-neutral-800">
            <span className="text-xs text-neutral-600">↑↓ navigate · Enter to select · Esc to close</span>
          </div>
        </div>
      )}

      {/* input */}
      <div className="p-4 pt-2 border-t border-neutral-800">
        {sendError && <p className="mb-2 text-xs text-red-400">{sendError}</p>}
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Message... (@ to mention)"
            value={draft}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded-full bg-neutral-800 border border-neutral-700 px-4 py-2 text-sm focus:outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            className="rounded-full bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
