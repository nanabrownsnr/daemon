"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Message = {
  id: string;
  sender_person_id: string;
  sender_type: "human" | "agent";
  body: string;
  created_at: string;
};

type Person = {
  id: string;
  display_name: string;
};

export default function ChatMessages({
  chatId,
  personId,
  personNames,
  chatMembers,
}: {
  chatId: string;
  personId: string;
  personNames: Record<string, string>;
  chatMembers: Person[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [mentionedPersonIds, setMentionedPersonIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const filteredMembers = mentionQuery !== null
    ? chatMembers.filter((m) =>
        m.display_name.toLowerCase().startsWith(mentionQuery.toLowerCase())
      )
    : [];

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("message")
      .select("id, sender_person_id, sender_type, body, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages(data ?? []));
  }, [chatId]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "message",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => setMessages((prev) => [...prev, payload.new as Message]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // reset highlighted index when mention list changes
  useEffect(() => { setHighlightedIndex(0); }, [mentionQuery]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setDraft(value);

    const textUpToCursor = value.slice(0, cursor);
    const atIndex = textUpToCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const query = textUpToCursor.slice(atIndex + 1);
      if (!query.includes(" ")) {
        setMentionQuery(query);
        setMentionStartIndex(atIndex);
        return;
      }
    }
    setMentionQuery(null);
    setMentionStartIndex(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionQuery === null || filteredMembers.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % filteredMembers.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handlePickMention(filteredMembers[highlightedIndex]);
    } else if (e.key === "Escape") {
      setMentionQuery(null);
      setMentionStartIndex(null);
    }
  }

  function handlePickMention(person: Person) {
    if (mentionStartIndex === null) return;
    const before = draft.slice(0, mentionStartIndex);
    const after = draft.slice(mentionStartIndex + 1 + (mentionQuery?.length ?? 0));
    setDraft(`${before}@${person.display_name} ${after}`);
    setMentionedPersonIds((prev) =>
      prev.includes(person.id) ? prev : [...prev, person.id]
    );
    setMentionQuery(null);
    setMentionStartIndex(null);
    inputRef.current?.focus();
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;

    const body = draft;
    const mentions = mentionedPersonIds;
    setDraft("");
    setMentionedPersonIds([]);

    const { data: msg, error } = await supabase
      .from("message")
      .insert({ chat_id: chatId, sender_person_id: personId, sender_type: "human", body })
      .select()
      .single();

    if (error || !msg) {
      setDraft(body);
      setMentionedPersonIds(mentions);
      return;
    }

    if (mentions.length > 0) {
      await supabase.from("message_mention").insert(
        mentions.map((pid) => ({ message_id: msg.id, person_id: pid }))
      );
    }
  }

  const isMyMessage = (m: Message) => m.sender_person_id === personId;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2 chat-scroll">
        {messages.map((m) => {
          const mine = isMyMessage(m);
          const senderLabel = m.sender_type === "agent"
            ? `${personNames[m.sender_person_id] ?? "Unknown"} (agent)`
            : personNames[m.sender_person_id] ?? "Unknown";

          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] space-y-0.5 ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {!mine && (
                  <span className="text-xs text-neutral-500 px-1">{senderLabel}</span>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm ${
                  mine
                    ? "bg-neutral-100 text-neutral-900 rounded-br-sm"
                    : "bg-neutral-800 text-neutral-100 rounded-bl-sm"
                }`}>
                  {m.body}
                </div>
                {m.sender_type === "agent" && (
                  <span className="text-xs text-neutral-600 px-1 italic">
                    Sent by {personNames[m.sender_person_id] ?? "Unknown"}'s dæmon
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* @ mention dropdown */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <div className="mx-4 mb-1 border border-neutral-700 rounded-lg bg-neutral-900 overflow-hidden shadow-lg">
          {filteredMembers.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handlePickMention(m)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                i === highlightedIndex ? "bg-neutral-700" : "hover:bg-neutral-800"
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-medium shrink-0">
                {m.display_name[0].toUpperCase()}
              </span>
              {m.display_name}
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-neutral-800">
            <span className="text-xs text-neutral-600">↑↓ navigate · Enter to select · Esc to close</span>
          </div>
        </div>
      )}

      {/* input */}
      <div className="p-4 pt-2 border-t border-neutral-800">
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