// Sprint 0: interface only. Sprint 2 implements the real Claude Code adapter.
// Every agent type (claude_code, cursor, ollama, ...) implements this same shape,
// so the rest of the app never needs to know which agent is behind a binding.

export type AgentContextMessage = {
  senderPersonId: string;
  senderType: "human" | "agent";
  body: string;
  createdAt: string;
};

export type AgentContext = {
  chatId: string;
  bindingId: string;
  // however much history the agent ingests on join — Sprint 2 decides
  // full-history vs summary vs recent-window. Keep this shape stable either way.
  recentMessages: AgentContextMessage[];
  // pinned links / folder contents relevant to this chat, once workspace
  // tooling (Sprint 1) exists
  pinnedContext?: string[];
};

export type AgentResponse = {
  body: string;
  // agent's own confidence signal, if it can express one — optional,
  // judgment engine doesn't depend on this for MVP (rule-based instead)
  confidence?: number;
};

export interface AgentAdapter {
  agentType: string;

  // Called when an agent binding joins a chat — ingest context.
  loadContext(context: AgentContext): Promise<void>;

  // Called when the agent is triggered (mention, or auto-eligible topic
  // detected) to produce a response. Does NOT decide mode (silent/suggested/
  // auto) — that's the judgment engine's job, layered on top of this call.
  respond(prompt: string, context: AgentContext): Promise<AgentResponse>;
}

// Sprint 2 implements this:
// export class ClaudeCodeAdapter implements AgentAdapter { ... }
