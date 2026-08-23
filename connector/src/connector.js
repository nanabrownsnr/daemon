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
const CONTEXT_FILE = join(CONFIG_DIR, "context_cursors.json");
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

function getContextCursor(bindingId) {
  return loadJson(CONTEXT_FILE)[bindingId] ?? null;
}

function storeContextCursor(bindingId, createdAt) {
  if (!createdAt) return;
  const cursors = loadJson(CONTEXT_FILE);
  if (cursors[bindingId] && cursors[bindingId] >= createdAt) return;
  cursors[bindingId] = createdAt;
  saveJson(CONTEXT_FILE, cursors);
}

async function getChatSummary(supabase, chatId) {
  const { data, error } = await supabase
    .from("chat_context_summary")
    .select("summary, through_created_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error) {
    // The connector remains compatible until the optional summary SQL is run.
    if (error.code !== "PGRST205" && error.code !== "42P01") {
      console.error("[daemon] Could not load chat summary:", error.message);
    }
    return null;
  }
  return data;
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
    sessionId,
    undefined,
    {
      workspaceWrite: binding._workspaceWrite === true,
      networkAccess: binding._networkAccess === true,
    },
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

export async function buildPrompt(supabase, triggerMessage, chatId, personDisplayName, options = {}) {
  // A resumed agent session already contains earlier groupwork turns. Send only
  // the chat delta after that binding's last successful invocation; use a
  // bounded recent window for the first invocation or after local state loss.
  let contextQuery = supabase
    .from("message")
    .select("id, body, sender_person_id, sender_type, created_at, sender:sender_person_id(display_name), agent:agent_binding_id(agent_label)")
    .eq("chat_id", chatId);

  if (options.contextSince) contextQuery = contextQuery.gt("created_at", options.contextSince);
  const { data: recentMessages } = await contextQuery
    .order("created_at", { ascending: false })
    .limit(options.contextSince ? 25 : 15);

  const contextLines = (recentMessages ?? [])
    .reverse()
    .filter((message) => !triggerMessage.id || message.id !== triggerMessage.id)
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
  const summaryBlock = options.chatSummary
    ? `Shared Running Summary (covers older chat history):\n${options.chatSummary}\n\n`
    : "";

  const roleDirective = options.isSolo
    ? `You are ${options.agentLabel ?? "a coding agent"} in ${personDisplayName}'s private Solo workspace. ${personDisplayName} coordinates the work and has explicitly addressed this message to you. Work from your own project directory and respond as this named agent.`
    : `You are the technical counterpart and proxy for ${personDisplayName} within an engineering team group chat. Your job is to field questions, extract insights from the local project files in your directory, and speak directly with the authority and voice of ${personDisplayName}.`;

  const workDirective = (options.workspaceWrite ?? options.isSolo)
    ? "You may inspect and modify files inside your assigned project workspace, run appropriate local validation, and use network access when required by the task. Do not perform destructive actions, publish externally, or expand beyond the approved request."
    : "Inspect the assigned project workspace to answer the team. This invocation is read-only; report the change needed rather than modifying files.";

  return `Role: ${roleDirective}

${summaryBlock}New Groupwork Context:
${contextLines}

Current Request:
From: ${triggerSenderName}
"${triggerMessage.body}"

Instructions:
1. ${workDirective}
2. Ground the work in the current project files and the new chat context above. Continue from your existing agent session without re-explaining prior work.
3. Be concise and concrete. Report what you changed, validation performed, and any blocker. Do not claim work you did not complete.
4. Do not invent commitments, deadlines, approvals, personal opinions, or decisions. Anything requiring ${personDisplayName}'s authority must be confirmed by ${personDisplayName}.`;
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
    if (error) {
      console.error("[daemon] Failed to post auto response:", error.message);
      return false;
    }
    console.log("[daemon] Act response posted to chat.");
    return true;
  } else {
    const { data: draft, error } = await supabase
      .from("private_thread_message")
      .insert({
        chat_id: chatId,
        person_id: personId,
        agent_binding_id: binding.id,
        sender_type: "agent",
        body: responseBody,
        topic_tag: triggerClassification?.topicTag ?? null,
        question_type: triggerClassification?.questionType ?? null,
        trigger_message_id: triggerMessageId ?? null,
      })
      .select()
      .single();
    if (error) {
      console.error("[daemon] Failed to post suggested draft:", error.message);
      return false;
    }
    console.log("[daemon] Suggested draft posted to private thread — awaiting human action.");
    // human action (send/edit/cancel) is logged by the web UI private thread component
    return true;
  }
}

// ============================================================
// Handle a single mention event
// ============================================================

export function resolveMentionBinding(chatBindings, explicitBinding = null) {
  if (explicitBinding) return explicitBinding;
  return chatBindings.length === 1 ? chatBindings[0] : null;
}

export async function handleMention(supabase, mention, person, bindingsByChat, explicitBinding = null, forceAdvice = false, options = {}) {
  const isSolo = options.isSolo ?? explicitBinding !== null;
  // fetch the triggering message
  const { data: msg } = await supabase
    .from("message")
    .select("id, body, sender_person_id, chat_id, created_at, sender:sender_person_id(display_name)")
    .eq("id", mention.message_id)
    .single();

  if (!msg) { console.error("[daemon] Could not fetch triggering message."); return false; }
  // Team mentions target the person and should not make their own agent answer
  // their own message. Solo mentions explicitly target a binding, so the owner
  // is expected to be the sender and must be allowed through.
  if (!explicitBinding && msg.sender_person_id === person.id) return false;

  if (isPaused()) {
    console.log("[daemon] Paused — mention received but not processing. Run: daemon-connect resume");
    return false;
  }

  const chatBindings = bindingsByChat[msg.chat_id] ?? [];
  const binding = resolveMentionBinding(chatBindings, explicitBinding);
  if (!binding) {
    console.error(`[daemon] Could not resolve one binding for chat ${msg.chat_id}. Solo chats require an explicit agent mention.`);
    return false;
  }
  if (binding.chat_id !== msg.chat_id) {
    console.error(`[daemon] Rejected agent mention for binding ${binding.id}: it does not belong to chat ${msg.chat_id}.`);
    return false;
  }

  // classification (cheap, synchronous regex) and prompt-building (async DB
  // fetch) don't depend on each other's output — run concurrently rather
  // than sequentially. classifyQuestion itself is instant either way, but
  // buildPrompt does a real DB round-trip, so no reason to make it wait.
  const classification = classifyQuestion(msg.body);
  const chatSummary = await getChatSummary(supabase, msg.chat_id);
  const bindingCursor = getContextCursor(binding.id);
  const summaryCursor = chatSummary?.through_created_at ?? null;
  const contextSince = [bindingCursor, summaryCursor].filter(Boolean).sort().at(-1) ?? null;
  const prompt = await buildPrompt(supabase, msg, msg.chat_id, person.display_name, {
    isSolo,
    agentLabel: binding.agent_label ?? AGENT_TYPES[binding.agent_type]?.label,
    contextSince,
    workspaceWrite: isSolo || options.workspaceWrite === true,
    chatSummary: chatSummary?.summary ?? null,
  });
  binding._prompt = prompt;
  binding._isSolo = isSolo;
  binding._workspaceWrite = isSolo || options.workspaceWrite === true;
  binding._networkAccess = isSolo || options.networkAccess === true;

  binding._beginWork?.();
  try {
    const response = await invokeAgent(binding);
    if (!response) {
      console.error("[daemon] No response from agent.");
      binding._finishWork?.(false);
      return false;
    }

    const routed = await routeResponse(supabase, person.id, binding, msg.chat_id, response, classification, msg.id, forceAdvice);
    if (!routed) {
      binding._finishWork?.(false);
      return false;
    }
    markLastSeen(person.id);
    storeContextCursor(binding.id, msg.created_at);
    binding._finishWork?.(true);
    return true;
  } catch (error) {
    console.error(`[daemon] Agent processing failed: ${error.message}`);
    binding._finishWork?.(false);
    return false;
  }
}

export async function handleRunRequest(supabase, request, person, bindingsByChat, bindingsById) {
  const binding = bindingsById[request.agent_binding_id];
  if (!binding || binding.person_id && binding.person_id !== person.id) return;

  const { data: claimed, error: claimError } = await supabase.rpc("claim_agent_run_request", {
    p_request_id: request.id,
  });
  if (claimError) {
    console.error(`[daemon] Could not claim approved run ${request.id}: ${claimError.message}`);
    return;
  }
  if (!claimed) return; // another delivery or connector process already claimed it

  let succeeded = false;
  try {
    succeeded = await handleMention(
      supabase,
      { message_id: request.message_id },
      person,
      bindingsByChat,
      binding,
      false,
      { isSolo: false, workspaceWrite: true, networkAccess: true },
    );
  } catch (error) {
    console.error(`[daemon] Approved run failed: ${error.message}`);
  } finally {
    const { error: finishError } = await supabase.rpc("finish_agent_run_request", {
      p_request_id: request.id,
      p_succeeded: succeeded,
    });
    if (finishError) console.error(`[daemon] Could not finish run ${request.id}: ${finishError.message}`);
  }
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

  // Team mentions resolve by chat; Solo mentions resolve by exact binding ID.
  const bindingsByChat = {};
  const bindingsById = {};
  const observedChats = new Set();
  const presenceByBinding = new Map();
  const observeChat = (chatId) => {
    if (observedChats.has(chatId)) return;
    observedChats.add(chatId);
    supabase
      .channel(`observe:${chatId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "message",
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        const msg = payload.new;
        if (msg.sender_person_id !== person.id) {
          console.log(`[daemon] [${chatId.slice(0,8)}] Observed:`, msg.body.slice(0, 60));
        }
      })
      .subscribe();
  };
  const startPresence = (binding) => {
    if (presenceByBinding.has(binding.id)) return;
    const channel = supabase.channel(`presence:${binding.id}`);
    const presence = {
      channel,
      interval: null,
      errorTimeout: null,
      status: "online",
      active: 0,
    };
    const track = async () => {
      await channel.track({
        status: presence.status,
        updated_at: new Date().toISOString(),
      });
    };
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await track();
    });
    presence.interval = setInterval(track, 15_000);
    presenceByBinding.set(binding.id, presence);
  };
  const beginBindingWork = (bindingId) => {
    const presence = presenceByBinding.get(bindingId);
    if (!presence) return;
    if (presence.errorTimeout) clearTimeout(presence.errorTimeout);
    presence.active += 1;
    presence.status = "working";
    void presence.channel.track({ status: "working", updated_at: new Date().toISOString() });
  };
  const finishBindingWork = (bindingId, succeeded) => {
    const presence = presenceByBinding.get(bindingId);
    if (!presence) return;
    presence.active = Math.max(0, presence.active - 1);
    if (presence.active > 0) return;
    presence.status = succeeded ? "online" : "error";
    void presence.channel.track({ status: presence.status, updated_at: new Date().toISOString() });
    if (!succeeded) {
      presence.errorTimeout = setTimeout(() => {
        if (presence.active === 0) {
          presence.status = "online";
          void presence.channel.track({ status: "online", updated_at: new Date().toISOString() });
        }
      }, 15_000);
    }
  };
  const stopPresence = (bindingId) => {
    const presence = presenceByBinding.get(bindingId);
    if (!presence) return;
    clearInterval(presence.interval);
    if (presence.errorTimeout) clearTimeout(presence.errorTimeout);
    void supabase.removeChannel(presence.channel);
    presenceByBinding.delete(bindingId);
  };
  const addOrUpdateBinding = (binding) => {
    binding._beginWork = () => beginBindingWork(binding.id);
    binding._finishWork = (succeeded) => finishBindingWork(binding.id, succeeded);
    bindingsById[binding.id] = binding;
    const chatBindings = bindingsByChat[binding.chat_id] ?? [];
    bindingsByChat[binding.chat_id] = [
      ...chatBindings.filter((existing) => existing.id !== binding.id),
      binding,
    ];
  };
  const removeBinding = (binding) => {
    delete bindingsById[binding.id];
    bindingsByChat[binding.chat_id] = (bindingsByChat[binding.chat_id] ?? [])
      .filter((existing) => existing.id !== binding.id);
  };
  for (const b of bindings) {
    addOrUpdateBinding(b);
    observeChat(b.chat_id);
    startPresence(b);
    console.log(`[daemon] Binding: ${b.agent_label ?? b.agent_type} → chat ${b.chat_id} @ ${b.project_path ?? "(cwd)"}`);
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
      addOrUpdateBinding(b);
      observeChat(b.chat_id);
      startPresence(b);
      console.log(`[daemon] New binding registered live: ${b.agent_label ?? b.agent_type} → chat ${b.chat_id.slice(0,8)} @ ${b.project_path ?? "(cwd)"}`);
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "agent_binding",
      filter: `person_id=eq.${person.id}`,
    }, (payload) => {
      const b = payload.new;
      addOrUpdateBinding(b); // refresh in-memory binding (picks up mode changes etc.)
      console.log(`[daemon] Binding updated: ${b.chat_id.slice(0,8)} mode=${b.mode}`);
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "agent_binding",
      filter: `person_id=eq.${person.id}`,
    }, (payload) => {
      removeBinding(payload.old);
      stopPresence(payload.old.id);
      console.log(`[daemon] Binding removed: ${payload.old.id}`);
    })
    .subscribe();

  // Team mentions create pending requests in the database. The connector only
  // receives them after the agent owner approves execution in Agent Workspace.
  supabase
    .channel(`approved-runs:${person.id}`)
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "agent_run_request",
      filter: `owner_person_id=eq.${person.id}`,
    }, async (payload) => {
      if (payload.new.status !== "approved") return;
      console.log("[daemon] Approved Team run received:", payload.new.id);
      await handleRunRequest(supabase, payload.new, person, bindingsByChat, bindingsById);
    })
    .subscribe();

  // Solo mentions target one exact binding. This channel deliberately has no
  // table filter because one connector can own many binding IDs; RLS limits
  // delivery, and unknown bindings are ignored locally.
  supabase
    .channel(`agent-mentions:${person.id}`)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "message_agent_mention",
    }, async (payload) => {
      const binding = bindingsById[payload.new.agent_binding_id];
      if (!binding) return;
      console.log(`[daemon] Explicit mention received for ${binding.agent_label ?? binding.agent_type}: ${payload.new.message_id}`);
      await handleMention(supabase, payload.new, person, bindingsByChat, binding);
    })
    .subscribe();

  // Presence lets the web UI show whether each binding's connector is online.
  // Note: presence relies on Supabase's server-side heartbeat timeout to
  // detect disconnection — there's no instant "goodbye" signal when a
  // process is killed abruptly (Ctrl+C, crash). Expect a delay of up to
  // ~30-60s between the connector actually stopping and the dot going grey.
  // Re-tracking periodically keeps our own state fresh and doesn't change
  // that server-side timeout, but avoids us looking stale sooner than we
  // have to.
  console.log(`[daemon] Connected. Listening for mentions of ${person.display_name} across ${bindings.length} chat(s).`);
  if (isPaused()) console.log("[daemon] ⚠️  Currently PAUSED — run daemon-connect resume to process mentions.");
  console.log("[daemon] Press Ctrl+C to stop.");

  // catch-up: approved Team runs are safe to resume because the owner already
  // made the execution and workspace-permission decision.
  const lastSeen = getLastSeen(person.id);
  const { data: approvedRuns, error: catchupError } = await supabase
    .from("agent_run_request")
    .select("id, message_id, agent_binding_id, permission, status, created_at")
    .eq("owner_person_id", person.id)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(10);

  if (catchupError) {
    console.error("[daemon] Approved-run catch-up query failed:", catchupError.message);
  } else if (approvedRuns?.length) {
    console.log(`[daemon] ${approvedRuns.length} approved Team run(s) waiting. Processing...`);
    for (const request of approvedRuns) {
      await handleRunRequest(supabase, request, person, bindingsByChat, bindingsById);
    }
    console.log("[daemon] Approved-run catch-up complete.");
  } else {
    console.log("[daemon] No approved Team runs waiting.");
  }

  let agentMentionQuery = supabase
    .from("message_agent_mention")
    .select("message_id, agent_binding_id, created_at")
    .in("agent_binding_id", Object.keys(bindingsById))
    .order("created_at", { ascending: true })
    .limit(10);

  if (lastSeen) agentMentionQuery = agentMentionQuery.gt("created_at", lastSeen);
  const { data: missedAgentMentions, error: agentCatchupError } = await agentMentionQuery;
  if (agentCatchupError) {
    console.error("[daemon] Solo catch-up query failed:", agentCatchupError.message);
  } else if (missedAgentMentions?.length) {
    console.log(`[daemon] ${missedAgentMentions.length} unprocessed explicit agent mention(s). Processing in Advice...`);
    for (const mention of missedAgentMentions) {
      const binding = bindingsById[mention.agent_binding_id];
      if (binding) await handleMention(supabase, mention, person, bindingsByChat, binding, true);
    }
    console.log("[daemon] Solo catch-up complete.");
  }

  process.on("SIGINT", () => {
    console.log("\n[daemon] Disconnecting...");
    process.exit(0);
  });
}
