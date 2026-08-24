"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PresenceState = {
  onlineBindings: Set<string>;
  workingBindings: Set<string>;
  workingDestinations: Map<string, "chat" | "private">;
};

const AgentPresenceContext = createContext<PresenceState>({
  onlineBindings: new Set(),
  workingBindings: new Set(),
  workingDestinations: new Map(),
});

export function AgentPresenceProvider({
  bindingIds,
  children,
}: {
  bindingIds: string[];
  children: React.ReactNode;
}) {
  const [onlineBindings, setOnlineBindings] = useState<Set<string>>(new Set());
  const [workingBindings, setWorkingBindings] = useState<Set<string>>(new Set());
  const [workingDestinations, setWorkingDestinations] = useState<Map<string, "chat" | "private">>(new Map());
  const supabase = useMemo(() => createClient(), []);
  const bindingKey = bindingIds.join(",");

  useEffect(() => {
    const ids = bindingKey ? bindingKey.split(",") : [];
    const channels = ids.map((bindingId) => {
      const channel = supabase.channel(`presence:${bindingId}`);
      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const entries = Object.values(state).flat() as Array<{
            status?: string;
            destination?: "chat" | "private";
          }>;
          const workingEntry = entries.find((entry) => entry.status === "working");

          setOnlineBindings((previous) => {
            const next = new Set(previous);
            if (Object.keys(state).length > 0) next.add(bindingId);
            else next.delete(bindingId);
            return next;
          });
          setWorkingBindings((previous) => {
            const next = new Set(previous);
            if (workingEntry) next.add(bindingId);
            else next.delete(bindingId);
            return next;
          });
          setWorkingDestinations((previous) => {
            const next = new Map(previous);
            if (workingEntry?.destination) next.set(bindingId, workingEntry.destination);
            else next.delete(bindingId);
            return next;
          });
        })
        .subscribe();
      return channel;
    });

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      setOnlineBindings(new Set());
      setWorkingBindings(new Set());
      setWorkingDestinations(new Map());
    };
  }, [bindingKey, supabase]);

  return (
    <AgentPresenceContext.Provider value={{ onlineBindings, workingBindings, workingDestinations }}>
      {children}
    </AgentPresenceContext.Provider>
  );
}

export function useAgentPresence() {
  return useContext(AgentPresenceContext);
}
