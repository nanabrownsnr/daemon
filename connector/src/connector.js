// dæmon connector — multi-binding relay
// One process manages ALL agent bindings for this person across all chats.
// Each binding has its own agent_type and project_path stored in the database.
// The connector pulls that info on startup — no per-binding env config needed.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { AGENT_TYPES } from "./agent-types.js";
import { getAuthenticatedClient } from "./auth.js";

// ============================================================
// Config — minimal, no per-binding values here
// ============================================================

// ============================================================
// Local state helpers
// ============================================================

const CONFIG_DIR = process.env.DAEMON_CONFIG_DIR ?? join(homedir(), ".daemon");
const SESSION_FILE = join(CONFIG_DIR, "sessions.json");
const LAST_SEEN_FILE = join(CONFIG_DIR, "last_seen.json");
const STATE_FILE = join(CONFIG_DIR, "state.json");

function isPaused() {
  return loadJson(STATE_FILE).paused === true;
}

export function pause() {
  ensureConfigDir();
  saveJson(STATE_FILE, { paused: true });
  console.log("[daemon] Paused. Mentions will not be processed until you run: daemon-connect resume");
}

export function resume() {
  ensureConfigDir();
  saveJson(STATE_FILE, { paused: false });
  console.log("[daemon] Resumed. Agent will process mentions.");
}

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return {}; }
}

function saveJson(path, data) {
  ensureConfigDir();
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function getStoredSessionId(bindingId) {
  return loadJson(SESSION_FILE)[bindingId] ?? null;
}

function storeSessionId(bindingId, sessionId) {
  const sessions = loadJson(SESSION_FILE);
  sessions[bindingId] = sessionId;
  saveJson(SESSION_FILE, sessions);
}

function getLastSeen(personId) {
  return loadJson(LAST_SEEN_FILE)[personId] ?? null;
}

function markLastSeen(personId) {
  const data = loadJson(LAST_SEEN_FILE);
  data[personId] = new Date().toISOString();
  saveJson(LAST_SEEN_FILE, data);
}

// ============================================================
// Auth
// ============================================================

// Invoke agent — generic, pulls type and path from binding
// ============================================================

async function invokeAgent(binding) {
  const agentDef = AGENT_TYPES[binding.agent_type];
  if (!agentDef) {
    console.error(`[daemon] Unknown agent type: ${binding.agent_type}`);
    return null;
  }

  // project_path from the database; fallback to cwd if not set (legacy)
  const projectDir = binding.project_path ?? process.cwd();
  const sessionId = getStoredSessionId(binding.id);

  console.log(`[daemon] Invoking ${agentDef.label} at ${projectDir}...`);

  const { response, sessionId: newSessionId } = await agentDef.invoke(
    binding._prompt, // set by the caller before invokeAgent is called
    projectDir,
    sessionId
  );

  if (newSessionId) storeSessionId(binding.id, newSessionId);
  return response;
}

// ============================================================
// Crude topic/question classification (keyword-based, MVP)
// Runs at mention-time on the triggering message. Not sophisticated —
// this is what P2's rule engine needs to learn per-topic trust, so it
// must exist before the rule engine is buildable, even in crude form.
// ============================================================

export function classifyQuestion(text) {
  const lower = text.toLowerCase();

  let questionType = "other";
  if (/\b(when|deadline|timeline|eta|by when|how long)\b/.test(lower)) questionType = "timeline";
  else if (/\b(should|think|recommend|opinion|better|prefer)\b/.test(lower)) questionType = "opinion";
  else if (/\b(can you|will you|commit|promise|agree)\b/.test(lower)) questionType = "commitment";
  else if (/\b(how|what|does|is|are|why)\b/.test(lower)) questionType = "factual";
  else if (/\b(bug|error|fix|deploy|api|endpoint|function|code)\b/.test(lower)) questionType = "technical";

  let topicTag = "general";
  if (/\b(api|endpoint|route)\b/.test(lower)) topicTag = "api";
  else if (/\b(deploy|deployment|release|ship)\b/.test(lower)) topicTag = "deployment";
  else if (/\b(bug|error|fix|broken|crash)\b/.test(lower)) topicTag = "bugs";
  else if (/\b(timeline|deadline|eta|when)\b/.test(lower)) topicTag = "timeline";
  else if (/\b(design|architecture|structure)\b/.test(lower)) topicTag = "architecture";

  return { questionType, topicTag };
}

// ============================================================
// Prompt builder
// ============================================================

export async function buildPrompt(supabase, triggerMessage, chatId, personDisplayName) {
  // Fetch recent group chat messages for immediate context
  const { data: recentMessages } = await supabase
    .from("message")
    .select("body, sender_person_id, sender_type, created_at, sender:sender_person_id(display_name), agent:agent_binding_id(agent_label)")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(15);

  const contextLines = (recentMessages ?? [])
    .reverse()
    .map((m) => {
      const senderName = m.sender?.display_name ?? "Unknown team member";
      if (m.sender_type === "agent") {
        const agentLabel = m.agent?.agent_label;
        return `[${agentLabel ? `${agentLabel}, ${senderName}'s agent` : `${senderName}'s agent`}]: ${m.body}`;
      }
      return `[${senderName}]: ${m.body}`;
    })
    .join("\n");

  const triggerSenderName = triggerMessage.sender?.display_name ?? "A team member";

  return `System Directive: You are the technical counterpart and proxy for ${personDisplayName} within an engineering team group chat. Your job is to field questions, extract insights from the local project files in your directory, and speak directly with the authority and voice of ${personDisplayName}.

Recent Group Chat Context:
${contextLines}

Target Message Addressed to You:
From: ${triggerSenderName}
"${triggerMessage.body}"

Instructions:
1. Ground your answer strictly in the current files and documents within your directory workspace and the ongoing conversation history above. Do not lose sight of what teammates just discussed.
2. Adopt a direct, peer-to-peer engineering tone. You are part of the core team—be concise, technical, and pragmatic.
3. Never break character. Do not mention that you are an AI, a language model, or acting on someone's behalf.
4. Do not invent decisions, commitments, deadlines, approvals, personal opinions, or completed actions that are not evidenced by the project files or conversation. If the answer requires ${personDisplayName}'s judgment or authorization, say that ${personDisplayName} needs to confirm.
5. If your local files or conversation history lack the answer, state clearly what is missing rather than guessing or padding the response.`;
}

// ============================================================
// Response routing
// ============================================================

export async function routeResponse(supabase, personId, binding, chatId, responseBody, triggerClassification = null, triggerMessageId = null, forceAdvice = false) {
  // Three-way mode logic:
  // - forceAdvice (catch-up mentions) always wins — never auto-post a stale batch
  // - 'advice' / 'act' are manual pins — human overrides, ignore learned trust
  // - 'judgment' asks the platform to decide per-topic, via decide_topic_mode()
  let mode;
  if (forceAdvice) {
    mode = "advice";
  } else if (binding.mode === "judgment") {
    const topicTag = triggerClassification?.topicTag ?? "general";
    const { data: judged, error: judgeError } = await supabase.rpc("decide_topic_mode", {
      p_person_id: personId,
      p_binding_id: binding.id,
      p_topic_tag: topicTag,
    });
    if (judgeError) {
      console.error("[daemon] Judgment decision failed, defaulting to advice:", judgeError.message);
      mode = "advice";
    } else {
      mode = judged ?? "advice";
      console.log(`[daemon] Judgment decided: ${mode} (topic: ${topicTag})`);
    }
  } else {
    mode = binding.mode ?? "advice";
  }

  if (mode === "act") {
    const { error } = await supabase.from("message").insert({
      chat_id: chatId,
      sender_person_id: personId,
      sender_type: "agent",
      agent_binding_id: binding.id,
      mode: "act",
      body: responseBody,
      topic_tag: triggerClassification?.topicTag ?? "general",
    });
    if (error) console.error("[daemon] Failed to post auto response:", error.message);
    else console.log("[daemon] Act response posted to chat.");
  } else {
    const { data: draft, error } = await supabase
      .from("private_thread_message")
      .insert({
        chat_id: chatId,
        person_id: personId,
        sender_type: "agent",
        body: responseBody,
        topic_tag: triggerClassification?.topicTag ?? null,
        question_type: triggerClassification?.questionType ?? null,
        trigger_message_id: triggerMessageId ?? null,
      })
      .select()
      .single();
    if (error) console.error("[daemon] Failed to post suggested draft:", error.message);
    else console.log("[daemon] Suggested draft posted to private thread — awaiting human action.");
    // human action (send/edit/cancel) is logged by the web UI private thread component
  }
}

// ============================================================
// Handle a single mention event
// ============================================================

async function handleMention(supabase, mention, person, bindingsByChat, forceAdvice = false) {
  // fetch the triggering message
  const { data: msg } = await supabase
    .from("message")
    .select("id, body, sender_person_id, chat_id, sender:sender_person_id(display_name)")
    .eq("id", mention.message_id)
    .single();

  if (!msg) { console.error("[daemon] Could not fetch triggering message."); return; }
  if (msg.sender_person_id === person.id) return; // don't respond to own messages

  if (isPaused()) {
    console.log("[daemon] Paused — mention received but not processing. Run: daemon-connect resume");
    return;
  }

  const binding = bindingsByChat[msg.chat_id];
  if (!binding) { console.error("[daemon] No binding found for chat:", msg.chat_id); return; }

  // classification (cheap, synchronous regex) and prompt-building (async DB
  // fetch) don't depend on each other's output — run concurrently rather
  // than sequentially. classifyQuestion itself is instant either way, but
  // buildPrompt does a real DB round-trip, so no reason to make it wait.
  const classification = classifyQuestion(msg.body);
  const prompt = await buildPrompt(supabase, msg, msg.chat_id, person.display_name);
  binding._prompt = prompt;

  const response = await invokeAgent(binding);
  if (!response) { console.error("[daemon] No response from agent."); return; }

  await routeResponse(supabase, person.id, binding, msg.chat_id, response, classification, msg.id, forceAdvice);
  markLastSeen(person.id);
}

// ============================================================
// Main
// ============================================================

export async function start() {
  console.log("[daemon] Starting connector...");

  let supabase;
  try {
    supabase = await getAuthenticatedClient();
  } catch (error) {
    console.error(`[daemon] ${error.message}`);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  console.log("[daemon] Authenticated as", user.email);
  const { data: person } = await supabase
    .from("person")
    .select("id, display_name")
    .eq("auth_user_id", user.id)
    .single();

  if (!person) {
    console.error("[daemon] No person record found. Sign up via the web UI first.");
    process.exit(1);
  }

  console.log("[daemon] Person:", person.display_name, "(", person.id, ")");

  // fetch ALL bindings for this person across all chats
  const { data: bindings } = await supabase
    .from("agent_binding")
    .select("id, chat_id, agent_type, agent_label, project_path, mode")
    .eq("person_id", person.id);

  if (!bindings || bindings.length === 0) {
    console.log("[daemon] No agent bindings found. Register an agent in the web UI first.");
    process.exit(0);
  }

  // index bindings by chat_id for fast lookup in handleMention
  const bindingsByChat = {};
  for (const b of bindings) {
    bindingsByChat[b.chat_id] = b;
    console.log(`[daemon] Binding: ${b.agent_label ?? b.agent_type} → chat ${b.chat_id} @ ${b.project_path ?? "(cwd)"}`);
  }

  // subscribe to all messages across all bound chats (for context)
  for (const binding of bindings) {
    supabase
      .channel(`observe:${binding.chat_id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "message",
        filter: `chat_id=eq.${binding.chat_id}`,
      }, (payload) => {
        const msg = payload.new;
        if (msg.sender_person_id !== person.id) {
          console.log(`[daemon] [${binding.chat_id.slice(0,8)}] Observed:`, msg.body.slice(0, 60));
        }
      })
      .subscribe();
  }

  // One channel handles both binding inserts and updates. Supabase does not
  // allow callbacks to be added to a channel after it has been subscribed.
  supabase
    .channel(`bindings:${person.id}`)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "agent_binding",
      filter: `person_id=eq.${person.id}`,
    }, (payload) => {
      const b = payload.new;
      bindingsByChat[b.chat_id] = b;
      console.log(`[daemon] New binding registered live: ${b.agent_label ?? b.agent_type} → chat ${b.chat_id.slice(0,8)} @ ${b.project_path ?? "(cwd)"}`);

      supabase
        .channel(`observe:${b.chat_id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "message",
          filter: `chat_id=eq.${b.chat_id}`,
        }, (messagePayload) => {
          const msg = messagePayload.new;
          if (msg.sender_person_id !== person.id) {
            console.log(`[daemon] [${b.chat_id.slice(0,8)}] Observed:`, msg.body.slice(0, 60));
          }
        })
        .subscribe();
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "agent_binding",
      filter: `person_id=eq.${person.id}`,
    }, (payload) => {
      const b = payload.new;
      bindingsByChat[b.chat_id] = b; // refresh in-memory binding (picks up mode changes etc.)
      console.log(`[daemon] Binding updated: ${b.chat_id.slice(0,8)} mode=${b.mode}`);
    })
    .subscribe();

  // single subscription for mentions of this person across ALL chats
  supabase
    .channel(`mentions:${person.id}`)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "message_mention",
      filter: `person_id=eq.${person.id}`,
    }, async (payload) => {
      console.log("[daemon] Mention received for message:", payload.new.message_id);
      await handleMention(supabase, payload.new, person, bindingsByChat);
    })
    .subscribe();

  // presence — lets the web UI show whether each binding's connector is online.
  // Note: presence relies on Supabase's server-side heartbeat timeout to
  // detect disconnection — there's no instant "goodbye" signal when a
  // process is killed abruptly (Ctrl+C, crash). Expect a delay of up to
  // ~30-60s between the connector actually stopping and the dot going grey.
  // Re-tracking periodically keeps our own state fresh and doesn't change
  // that server-side timeout, but avoids us looking stale sooner than we
  // have to.
  for (const binding of bindings) {
    const presenceChannel = supabase.channel(`presence:${binding.id}`);
    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ online_at: new Date().toISOString() });
      }
    });
    setInterval(async () => {
      await presenceChannel.track({ online_at: new Date().toISOString() });
    }, 15_000);
  }

  console.log(`[daemon] Connected. Listening for mentions of ${person.display_name} across ${bindings.length} chat(s).`);
  if (isPaused()) console.log("[daemon] ⚠️  Currently PAUSED — run daemon-connect resume to process mentions.");
  console.log("[daemon] Press Ctrl+C to stop.");

  // catch-up: unprocessed mentions since last session
  const lastSeen = getLastSeen(person.id);
  let query = supabase
    .from("message_mention")
    .select("message_id, person_id, created_at")
    .eq("person_id", person.id)
    .order("created_at", { ascending: true })
    .limit(10);

  if (lastSeen) query = query.gt("created_at", lastSeen);
  const { data: missed, error: catchupError } = await query;

  if (catchupError) {
    console.error("[daemon] Catch-up query failed:", catchupError.message);
  } else if (missed && missed.length > 0) {
    console.log(`[daemon] ${missed.length} unprocessed mention(s) since last session. Processing (forced to Advice — unattended Act responses to a stale batch are unsafe)...`);
    for (const mention of missed) {
      await handleMention(supabase, mention, person, bindingsByChat, true); // forceAdvice
    }
    console.log("[daemon] Catch-up complete.");
  } else {
    console.log("[daemon] No missed mentions since last session.");
  }

  process.on("SIGINT", () => {
    console.log("\n[daemon] Disconnecting...");
    process.exit(0);
  });
}
