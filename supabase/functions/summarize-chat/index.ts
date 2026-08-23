import { createClient } from "npm:@supabase/supabase-js@2";

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: { chat_id?: string };
};

type SummaryMessage = {
  body: string;
  sender_type: string;
  sender_name: string;
  agent_label: string | null;
};

type SummaryBatch = {
  previous_summary: string;
  summary_version: number;
  messages: SummaryMessage[];
  through_created_at: string;
};

function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return keys.default ?? Object.values(keys)[0];
}

function formatMessages(messages: SummaryMessage[]) {
  return messages.map((message) => {
    const label = message.sender_type === "agent"
      ? message.agent_label ?? `${message.sender_name}'s agent`
      : message.sender_name;
    return `[${label}]: ${message.body}`;
  }).join("\n");
}

function providerError(status: number, payload: unknown) {
  const result = payload as {
    error?: { message?: string; code?: string | number; metadata?: unknown };
  };
  const details = [
    `OpenRouter ${status}`,
    result?.error?.code != null ? `code ${result.error.code}` : null,
    result?.error?.message ?? "Unknown provider error",
    result?.error?.metadata ? JSON.stringify(result.error.metadata) : null,
  ].filter(Boolean);
  return details.join(": ").slice(0, 1000);
}

function retryDelayMs(response: Response, payload: unknown, attempt: number) {
  const result = payload as {
    error?: { metadata?: { retry_after_seconds?: number; retry_after_seconds_raw?: number } };
  };
  const headerSeconds = Number(response.headers.get("retry-after"));
  const metadataSeconds = Number(
    result?.error?.metadata?.retry_after_seconds ??
      result?.error?.metadata?.retry_after_seconds_raw,
  );
  const requestedSeconds = Number.isFinite(headerSeconds) && headerSeconds > 0
    ? headerSeconds
    : metadataSeconds;
  const seconds = Number.isFinite(requestedSeconds) && requestedSeconds > 0
    ? requestedSeconds
    : attempt * 2;
  return Math.min(seconds, 15) * 1000;
}

async function requestSummary(
  openRouterKey: string,
  model: string,
  referer: string,
  prompt: string,
) {
  let lastError = "OpenRouter request failed";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "Groupwork chat summaries",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1200,
        provider: { zdr: true, allow_fallbacks: true },
        messages: [
          { role: "system", content: "You maintain factual shared project context. Never add information absent from the supplied chat." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const raw = await response.text();
    let completion: Record<string, unknown> = {};
    try {
      completion = raw ? JSON.parse(raw) : {};
    } catch {
      completion = { error: { message: raw || "Empty provider response" } };
    }

    if (response.ok) return completion;
    lastError = providerError(response.status, completion);
    const retryable = response.status === 408 || response.status === 409 ||
      response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 3) break;
    const delayMs = retryDelayMs(response, completion, attempt);
    console.warn(
      `OpenRouter attempt ${attempt} failed (${response.status}); retrying in ${delayMs / 1000}s.`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(lastError);
}

async function processSummary(
  supabase: ReturnType<typeof createClient>,
  chatId: string,
  openRouterKey: string,
  model: string,
  referer: string,
) {
  const { data, error: claimError } = await supabase.rpc("claim_chat_summary_batch", {
    p_chat_id: chatId,
    p_batch_size: 20,
  });
  if (claimError) throw new Error(`Could not claim summary batch: ${claimError.message}`);
  if (!data) return;

  const batch = data as SummaryBatch;
  const prompt = `Maintain Groupwork's shared running summary for an engineering chat.

Previous shared summary:
${batch.previous_summary || "No previous summary."}

New messages:
${formatMessages(batch.messages)}

Return only the updated summary, under 700 words, with these headings:
Goal and scope; Decisions and constraints; Completed work; Current state; Open tasks and blockers; Ownership and handoffs.
Preserve explicit corrections, permissions, unresolved questions, and ownership. Remove superseded details and casual chatter. Do not invent facts.`;

  try {
    const completion = await requestSummary(openRouterKey, model, referer, prompt) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const summary = completion?.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new Error("OpenRouter returned an empty summary");

    const { error: finishError } = await supabase.rpc("finish_chat_summary_batch", {
      p_chat_id: chatId,
      p_summary: summary,
      p_through_created_at: batch.through_created_at,
      p_model_used: completion.model ?? model,
      p_prompt_tokens: completion.usage?.prompt_tokens ?? null,
      p_completion_tokens: completion.usage?.completion_tokens ?? null,
    });
    if (finishError) throw new Error(finishError.message);
    console.log(`Summarized chat ${chatId} at version ${batch.summary_version + 1} with ${completion.model ?? model}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.rpc("fail_chat_summary_batch", { p_chat_id: chatId, p_error: message });
    console.error(`Summary failed for chat ${chatId}: ${message}`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const webhookSecret = Deno.env.get("SUMMARY_WEBHOOK_SECRET");
  if (!webhookSecret || request.headers.get("x-groupwork-summary-secret") !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  const model = Deno.env.get("OPENROUTER_SUMMARY_MODEL") ?? "openrouter/free";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = secretKey();
  if (!openRouterKey || !supabaseUrl || !adminKey) {
    return Response.json({ error: "Required function secrets are missing" }, { status: 500 });
  }

  const payload = await request.json() as WebhookPayload;
  const chatId = payload.record?.chat_id;
  if (payload.type !== "INSERT" || payload.table !== "message" || !chatId) {
    return Response.json({ skipped: true, reason: "Not a message insert" });
  }

  const supabase = createClient(supabaseUrl, String(adminKey), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  EdgeRuntime.waitUntil(
    processSummary(
      supabase,
      chatId,
      openRouterKey,
      model,
      Deno.env.get("GROUPWORK_APP_URL") ?? supabaseUrl,
    ).catch((error) => console.error("Summary worker failed before processing:", error)),
  );
  return Response.json({ accepted: true }, { status: 202 });
});
