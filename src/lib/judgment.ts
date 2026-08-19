// Judgment engine — decides whether an agent response should be sent
// automatically (auto), drafted for human approval (suggested), or
// suppressed entirely (silent).
//
// MVP implementation: always returns 'suggested' as the safe default.
// The rule-based promotion logic (Sprint 4 in the original dev plan)
// will replace this once the basic loop is proven end-to-end.
//
// The connector imports and calls decideMode() before routing a response.
// This file is the single place that logic lives — don't inline it in
// the connector or the web app.

export type ResponseMode = "silent" | "suggested" | "auto";

export type JudgmentInput = {
  personId: string;
  agentBindingId: string;
  topicTag: string | null;
  relationshipCategory: string; // 'internal_team' | 'external'
};

export type JudgmentDecision = {
  mode: ResponseMode;
  reason: string;
};

export async function decideMode(
  input: JudgmentInput
): Promise<JudgmentDecision> {
  // MVP: always suggested — conservative default until rule engine is built.
  // To test the full auto loop end-to-end, temporarily change this to
  // return { mode: "auto", reason: "mvp_auto_override" } — but revert
  // before adding any real users, since this bypasses all judgment entirely.
  return {
    mode: "suggested",
    reason: "mvp_default_suggested",
  };
}

export type JudgmentSignal =
  | "sent_unedited"
  | "sent_edited"
  | "ignored"
  | "handled_manually"
  | "corrected_after_send";

export async function recordJudgmentEvent(
  personId: string,
  agentBindingId: string,
  topicTag: string | null,
  signal: JudgmentSignal
): Promise<void> {
  // TODO Sprint 4: insert into judgment_event table
  // For now just log — the connector calls this and it's safe to no-op
  console.log("[judgment]", { personId, agentBindingId, topicTag, signal });
}
