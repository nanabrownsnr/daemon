"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ChatSummary = {
  summary: string;
  summary_version: number;
  status: "idle" | "processing" | "failed";
  updated_at: string;
};

export default function ChatSummary({ chatId }: { chatId: string }) {
  const [context, setContext] = useState<ChatSummary | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("chat_context_summary")
      .select("summary, summary_version, status, updated_at")
      .eq("chat_id", chatId)
      .maybeSingle()
      .then(({ data }) => setContext(data as ChatSummary | null));

    const channel = supabase
      .channel(`chat-summary:${chatId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_context_summary",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => setContext(payload.new as ChatSummary))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatId, supabase]);

  if (!context?.summary) {
    return (
      <p className="text-xs leading-5 text-neutral-600">
        Shared context will appear after 20 messages.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-xs leading-5 text-neutral-400">{context.summary}</p>
      <p className="text-[11px] text-neutral-700">Shared summary · version {context.summary_version}</p>
    </div>
  );
}
