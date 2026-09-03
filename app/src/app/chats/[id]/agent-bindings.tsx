"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAgentPresence } from "./agent-presence";

type AgentBinding = {
  id: string;
  person_id: string;
  agent_type: string;
  agent_label: string | null;
  mode: string;
};

type Props = {
  chatId: string;
  personId: string;
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex_cli: "Codex CLI",
};

export default function AgentBindings({ chatId, personId }: Props) {
  const [bindings, setBindings] = useState<AgentBinding[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const { onlineBindings } = useAgentPresence();
  // Keep one browser client for the component lifetime. Recreating it during
  // presence-driven renders tears down and resubscribes every binding channel,
  // which can make an online or working agent briefly appear offline.
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase
      .from("agent_binding")
      .select("id, person_id, agent_type, agent_label, mode")
      .eq("chat_id", chatId)
      .then(({ data }) => setBindings(data ?? []));
  }, [chatId, supabase]);

  // live updates — picks up new bindings registered while on the page
  useEffect(() => {
    const channel = supabase
      .channel(`bindings-ui:${chatId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "agent_binding",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => setBindings((prev) => [...prev, payload.new as AgentBinding]))
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "agent_binding",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => setBindings((prev) =>
        prev.map((b) => b.id === payload.new.id ? { ...b, ...payload.new } : b)
      ))
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "agent_binding",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => setBindings((prev) => prev.filter((b) => b.id !== payload.old.id)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId, supabase]);

  async function handleSetMode(binding: AgentBinding, newMode: string) {
    if (binding.mode === newMode) return;
    // optimistic update — flip immediately so the UI responds at once
    setBindings((prev) => prev.map((b) => b.id === binding.id ? { ...b, mode: newMode } : b));
    setLoading(binding.id);

    const { error } = await supabase
      .from("agent_binding")
      .update({ mode: newMode })
      .eq("id", binding.id);

    if (error) {
      // revert on failure
      setBindings((prev) => prev.map((b) => b.id === binding.id ? { ...b, mode: binding.mode } : b));
      console.error("[groupwork] Failed to update mode:", error.message);
    }
    setLoading(null);
  }

  async function handleRemove(binding: AgentBinding) {
    setLoading(binding.id);
    await supabase.from("agent_binding").delete().eq("id", binding.id);
    setBindings((prev) => prev.filter((b) => b.id !== binding.id));
    setLoading(null);
  }

  if (bindings.length === 0) {
    return <p className="text-xs text-neutral-600">No agents yet.</p>;
  }

  const MODES = [
    { key: "advice", label: "Advice" },
    { key: "act", label: "Act" },
    { key: "judgment", label: "Judgment" },
  ];

  return (
    <ul className="space-y-2">
      {bindings.map((b) => {
        const isMe = b.person_id === personId;
        const isOnline = onlineBindings.has(b.id);
        const statusTitle = isOnline ? "Connector online" : "Connector offline";
        const statusClass = isOnline ? "bg-green-500" : "bg-neutral-600";
        return (
          <li key={b.id} className="flex items-center gap-2 text-sm">
            {/* presence indicator — reflects whether the connector is actually running */}
            <span
              title={statusTitle}
              aria-label={statusTitle}
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusClass}`}
            />

            {/* name */}
            <span className="text-neutral-300 truncate flex-1 min-w-0">
              {b.agent_label ?? AGENT_TYPE_LABELS[b.agent_type] ?? b.agent_type}
              {isMe && <span className="text-neutral-600 ml-1 text-xs">you</span>}
            </span>

            {/* Advice/Act are manual pins; Judgment delegates the per-topic
                decision to the platform's learned trust rule. */}
            {isMe && (
              <div className="relative shrink-0">
                <select
                  value={b.mode}
                  onChange={(event) => handleSetMode(b, event.target.value)}
                  disabled={loading === b.id}
                  aria-label={`Response mode for ${b.agent_label ?? AGENT_TYPE_LABELS[b.agent_type] ?? b.agent_type}`}
                  title="Advice/Act are manual overrides. Judgment lets the platform decide per-topic, based on how much trust that topic has earned."
                  className="appearance-none rounded-md border border-neutral-700 bg-neutral-900 py-1 pl-2 pr-6 text-[11px] text-neutral-300 outline-none transition-colors hover:border-neutral-500 focus:border-neutral-400 disabled:opacity-50"
                >
                  {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500">⌄</span>
              </div>
            )}


            {/* remove — only for own binding */}
            {isMe && (
              <button
                onClick={() => handleRemove(b)}
                disabled={loading === b.id}
                title="Remove agent"
                className="text-neutral-600 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
