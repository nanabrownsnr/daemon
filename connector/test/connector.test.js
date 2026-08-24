import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// connector.js validates these at import time but does not connect until start().
process.env.GROUPWORK_SUPABASE_URL ??= "https://regression.invalid";
process.env.GROUPWORK_SUPABASE_ANON_KEY ??= "regression-key";
process.env.GROUPWORK_EMAIL ??= "regression@example.com";
process.env.GROUPWORK_PASSWORD ??= "regression-password";
process.env.GROUPWORK_CONFIG_DIR = mkdtempSync(join(tmpdir(), "groupwork-regression-"));

const { classifyQuestion, classifyMessageTopic, buildPrompt, routeResponse, pause, resume, resolveMentionBinding, enqueueBindingWork } = await import("../src/connector.js");
const { AGENT_TYPES } = await import("../src/agent-types.js");
const { LocalTopicClassifier } = await import("../src/topic-classifier.js");

function responseQuery(data) {
  return {
    select() { return this; },
    eq() { return this; },
    gt() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data }); },
  };
}

function routingClient({ judged = "advice", judgeError = null } = {}) {
  const inserts = [];
  const rpcCalls = [];
  return {
    inserts,
    rpcCalls,
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return { data: judged, error: judgeError };
    },
    from(table) {
      return {
        insert(row) {
          inserts.push({ table, row });
          const result = { data: { id: "draft-id", ...row }, error: null };
          return {
            then(resolve) { return Promise.resolve(result).then(resolve); },
            select() { return this; },
            single() { return Promise.resolve(result); },
          };
        },
      };
    },
  };
}

test("classifies supported MVP topics and question types", () => {
  assert.deepEqual(classifyQuestion("When is the deployment deadline?"), {
    questionType: "timeline",
    topicTag: "deployment",
  });
  assert.deepEqual(classifyQuestion("Should we redesign this architecture?"), {
    questionType: "opinion",
    topicTag: "architecture",
  });
  assert.deepEqual(classifyQuestion("Hello teammate"), {
    questionType: "other",
    topicTag: "general",
  });
});

test("local topic model warm-up is single-flight", async () => {
  let loads = 0;
  const classifier = new LocalTopicClassifier({
    loadPipeline: async () => {
      loads += 1;
      return async () => ({ tolist: () => [[1, 0]] });
    },
  });
  await Promise.all([classifier.warmup(), classifier.warmup(), classifier.warmup()]);
  assert.equal(loads, 1);
  assert.equal(classifier.getStatus().status, "ready");
});

test("classification falls back immediately while the model is loading", async () => {
  let finishLoading;
  const loading = new Promise((resolve) => { finishLoading = resolve; });
  const classifier = new LocalTopicClassifier({ loadPipeline: () => loading });
  void classifier.warmup();
  const result = await classifier.classifyNow(
    "Fix the endpoint",
    { topicTag: "api", questionType: "technical" },
    2,
  );
  assert.equal(result.source, "keyword_fallback");
  assert.equal(result.topicTag, "api");
  finishLoading(async () => ({ tolist: () => [[1, 0]] }));
  await classifier.modelPromise;
});

test("local classifier only uses vectors from the requested catalog version", async () => {
  const fakePipeline = async (input) => {
    if (Array.isArray(input)) return { tolist: () => [[1, 0], [0, 1]] };
    return { tolist: () => [[0.95, 0.05]] };
  };
  const classifier = new LocalTopicClassifier({ loadPipeline: async () => fakePipeline });
  const definitions = [
    { slug: "api", name: "API", description: "Endpoints", examples: [] },
    { slug: "testing", name: "Testing", description: "Tests", examples: [] },
  ];
  await classifier.prepareCatalog(definitions, 7);
  const semantic = await classifier.classifyNow(
    "Change the endpoint",
    { topicTag: "general", questionType: "technical" },
    7,
  );
  assert.equal(semantic.topicTag, "api");
  assert.equal(semantic.source, "local_embedding");

  const stale = await classifier.classifyNow(
    "Change the endpoint",
    { topicTag: "general", questionType: "technical" },
    8,
  );
  assert.equal(stale.source, "keyword_fallback");
});

test("platform catalog drives local classification and stores immutable evidence", async () => {
  const rpcCalls = [];
  const supabase = {
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === "get_topic_catalog_version") return { data: 42, error: null };
      if (name === "get_topic_definitions") {
        return { data: [
          { slug: "general", name: "General", description: "General", examples: [], active: true },
          { slug: "database", name: "Database", description: "Postgres and SQL", examples: [], active: true },
        ], error: null };
      }
      if (name === "record_message_topic_classification") {
        return { data: {
          topic_slug: args.p_topic_slug,
          source: args.p_source,
          confidence: args.p_confidence,
        }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        lte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [{ id: "message-1", body: "Update the Postgres policy" }], error: null }); },
      };
    },
  };
  const classifier = {
    prepareCatalog() { return Promise.resolve(true); },
    classifyNow(text, fallback, version) {
      assert.match(text, /Postgres/);
      assert.equal(version, 42);
      return Promise.resolve({ ...fallback, topicTag: "database", source: "local_embedding", confidence: 0.88 });
    },
  };

  const result = await classifyMessageTopic(supabase, {
    id: "message-1",
    chat_id: "chat-1",
    created_at: "2026-08-24T00:00:00Z",
    body: "Update the Postgres policy",
  }, { id: "binding-1" }, classifier);

  assert.equal(result.topicTag, "database");
  assert.deepEqual(rpcCalls.at(-1), {
    name: "record_message_topic_classification",
    args: {
      p_message_id: "message-1",
      p_agent_binding_id: "binding-1",
      p_topic_slug: "database",
      p_confidence: 0.88,
      p_source: "local_embedding",
      p_model_id: "Xenova/all-MiniLM-L6-v2",
      p_model_version: "local-minilm-v1@751bff37182d",
      p_topic_catalog_version: 42,
    },
  });
});

test("pause and resume persist connector state", () => {
  pause();
  assert.equal(JSON.parse(readFileSync(join(process.env.GROUPWORK_CONFIG_DIR, "state.json"), "utf8")).paused, true);
  resume();
  assert.equal(JSON.parse(readFileSync(join(process.env.GROUPWORK_CONFIG_DIR, "state.json"), "utf8")).paused, false);
});

test("prompt includes recent context, target message, and owner identity", async () => {
  const supabase = { from: () => responseQuery([
    { body: "First", sender_type: "human", sender: { display_name: "Ama" }, agent: null },
    { body: "Second", sender_type: "agent", sender: { display_name: "Nana" }, agent: { agent_label: "NanaAgent" } },
  ]) };
  const prompt = await buildPrompt(supabase, { body: "What changed?", sender: { display_name: "Ama" } }, "chat-1", "Nana");
  assert.match(prompt, /Nana/);
  assert.match(prompt, /\[Ama\]: First/);
  assert.match(prompt, /\[NanaAgent, Nana's agent\]: Second/);
  assert.match(prompt, /From: Ama/);
  assert.match(prompt, /What changed\?/);
  assert.match(prompt, /Do not invent commitments, deadlines, approvals/);
});

test("Solo prompt keeps the selected agent identity", async () => {
  const supabase = { from: () => responseQuery([]) };
  const prompt = await buildPrompt(
    supabase,
    { body: "Review this API", sender: { display_name: "Nana" } },
    "solo-chat",
    "Nana",
    { isSolo: true, agentLabel: "Codex backend", contextSince: "2026-01-01T00:00:00Z" },
  );
  assert.match(prompt, /Codex backend/);
  assert.match(prompt, /private Solo workspace/);
  assert.match(prompt, /explicitly addressed/);
  assert.match(prompt, /inspect and modify the project/);
  assert.match(prompt, /terminal-equivalent host access/);
  assert.match(prompt, /manage local processes and ports across invocations/);
  assert.match(prompt, /Complete the requested action in a bounded way/);
  assert.match(prompt, /always return a response to the group/);
  assert.match(prompt, /fully detached in the background/);
  assert.match(prompt, /leaving it running/);
  assert.match(prompt, /log location/);
});

test("prompt layers a shared summary under the recent raw delta", async () => {
  const supabase = { from: () => responseQuery([
    { body: "The latest correction", sender_type: "human", sender: { display_name: "Ama" }, agent: null },
  ]) };
  const prompt = await buildPrompt(
    supabase,
    { body: "Proceed", sender: { display_name: "Ama" } },
    "chat-1",
    "Nana",
    { chatSummary: "Decision: use the REST API.", workspaceWrite: true },
  );
  assert.match(prompt, /Shared Running Summary/);
  assert.match(prompt, /Decision: use the REST API/);
  assert.match(prompt, /\[Ama\]: The latest correction/);
  assert.match(prompt, /inspect and modify files/i);
});

test("an accepted Team request receives terminal-equivalent execution instructions", async () => {
  const supabase = { from: () => responseQuery([]) };
  const prompt = await buildPrompt(
    supabase,
    { body: "Implement the approved change", sender: { display_name: "Ama" } },
    "team-chat",
    "Nana",
    { workspaceWrite: true, fullAccess: true },
  );
  assert.match(prompt, /terminal-equivalent host access/);
  assert.match(prompt, /explicitly authorized request/);
});

test("mention routing requires an exact binding when a chat has several agents", () => {
  const claude = { id: "claude" };
  const codex = { id: "codex" };
  assert.equal(resolveMentionBinding([claude]), claude);
  assert.equal(resolveMentionBinding([claude, codex]), null);
  assert.equal(resolveMentionBinding([claude, codex], codex), codex);
});

test("work is serialized per binding while different bindings remain independent", async () => {
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = enqueueBindingWork("binding-a", async () => {
    events.push("a1-start");
    await firstGate;
    events.push("a1-end");
  });
  const second = enqueueBindingWork("binding-a", async () => events.push("a2"));
  const other = enqueueBindingWork("binding-b", async () => events.push("b1"));

  await other;
  assert.deepEqual(events, ["a1-start", "b1"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["a1-start", "b1", "a1-end", "a2"]);
});

test("Advice creates a private draft with classification and trigger", async () => {
  const db = routingClient();
  await routeResponse(db, "person-1", { id: "binding-1", mode: "advice" }, "chat-1", "Draft", {
    topicTag: "api", questionType: "technical",
  }, "trigger-1");
  assert.deepEqual(db.inserts, [{
    table: "private_thread_message",
    row: {
      chat_id: "chat-1", person_id: "person-1", agent_binding_id: "binding-1", sender_type: "agent", body: "Draft",
      topic_tag: "api", question_type: "technical", trigger_message_id: "trigger-1",
    },
  }]);
});

test("Act posts once and does not create a self-reinforcing judgment event", async () => {
  const db = routingClient();
  await routeResponse(db, "person-1", { id: "binding-1", mode: "act" }, "chat-1", "Answer", {
    topicTag: "api", questionType: "technical",
  });
  assert.equal(db.inserts.length, 1);
  assert.equal(db.inserts[0].table, "message");
  assert.equal(db.inserts[0].row.mode, "act");
  assert.equal(db.inserts[0].row.topic_tag, "api");
  assert.equal(db.inserts.some(({ table }) => table === "judgment_event"), false);
});

test("Judgment uses the topic RPC and follows its decision", async () => {
  const db = routingClient({ judged: "act" });
  await routeResponse(db, "person-1", { id: "binding-1", mode: "judgment" }, "chat-1", "Answer", {
    topicTag: "bugs", questionType: "technical",
  });
  assert.deepEqual(db.rpcCalls, [{ name: "decide_topic_mode", args: {
    p_person_id: "person-1", p_binding_id: "binding-1", p_topic_tag: "bugs",
  } }]);
  assert.equal(db.inserts[0].table, "message");
});

test("Judgment RPC errors and catch-up both fail safely to Advice", async () => {
  const failed = routingClient({ judgeError: { message: "offline" } });
  await routeResponse(failed, "person-1", { id: "binding-1", mode: "judgment" }, "chat-1", "Draft", null, "trigger-1");
  assert.equal(failed.inserts[0].table, "private_thread_message");

  const catchup = routingClient({ judged: "act" });
  await routeResponse(catchup, "person-1", { id: "binding-1", mode: "judgment" }, "chat-1", "Draft", null, "trigger-1", true);
  assert.equal(catchup.rpcCalls.length, 0);
  assert.equal(catchup.inserts[0].table, "private_thread_message");
});

test("Claude adapter is read-only, resumes sessions, and parses JSON output", async () => {
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end() {} };
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(JSON.stringify({ result: "Done", session_id: "new-session" })));
      child.emit("close", 0);
    });
    return child;
  };
  const result = await AGENT_TYPES.claude_code.invoke("Prompt", "/tmp/project", "old-session", fakeSpawn);
  assert.equal(invocation.command, "claude");
  assert.ok(invocation.args.includes("Read,Grep,Glob,LS"));
  assert.deepEqual(invocation.args.slice(-2), ["--resume", "old-session"]);
  assert.equal(invocation.options.cwd, "/tmp/project");
  assert.deepEqual(result, { response: "Done", sessionId: "new-session" });
});

test("Claude first invocation falls back to a new session when continue fails", async () => {
  const invocations = [];
  const fakeSpawn = (command, args, options) => {
    invocations.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end() {} };
    queueMicrotask(() => {
      if (invocations.length === 1) {
        child.stdout.emit("data", Buffer.from(JSON.stringify({ result: "No conversation found" })));
        child.emit("close", 1);
        return;
      }
      child.stdout.emit("data", Buffer.from(JSON.stringify({ result: "Started fresh", session_id: "fresh-session" })));
      child.emit("close", 0);
    });
    return child;
  };

  const result = await AGENT_TYPES.claude_code.invoke("Prompt", "/tmp/project", null, fakeSpawn);

  assert.equal(invocations.length, 2);
  assert.ok(invocations[0].args.includes("--continue"));
  assert.ok(!invocations[1].args.includes("--continue"));
  assert.ok(!invocations[1].args.includes("--resume"));
  assert.deepEqual(result, { response: "Started fresh", sessionId: "fresh-session" });
});

test("Codex adapter is read-only, resumes sessions, and parses JSONL output", async () => {
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end() {} };
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from([
        JSON.stringify({ type: "thread.started", thread_id: "new-thread" }),
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "Done from Codex" },
        }),
        JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10 } }),
      ].join("\n")));
      child.emit("close", 0);
    });
    return child;
  };

  const result = await AGENT_TYPES.codex_cli.invoke(
    "Prompt",
    "/tmp/project",
    "old-thread",
    fakeSpawn,
  );

  assert.equal(invocation.command, "codex");
  assert.ok(invocation.args.includes("read-only"));
  assert.ok(invocation.args.includes("resume"));
  assert.deepEqual(
    invocation.args.slice(-3),
    ["--skip-git-repo-check", "old-thread", "Prompt"],
  );
  assert.equal(invocation.options.cwd, "/tmp/project");
  assert.deepEqual(result, { response: "Done from Codex", sessionId: "new-thread" });
});

test("Codex returns a completed turn without waiting for inherited streams to close", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end() {}, destroy() {} };
    child.stdout.destroy = () => {};
    child.stderr.destroy = () => {};
    child.unref = () => {};
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from([
        JSON.stringify({ type: "thread.started", thread_id: "detached-thread" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Server is running" } }),
        JSON.stringify({ type: "turn.completed" }),
      ].join("\n") + "\n"));
      // Deliberately never emit `close`: this models a detached server that
      // inherited a descriptor from the completed Codex process.
    });
    return child;
  };

  const result = await AGENT_TYPES.codex_cli.invoke(
    "Start the server",
    "/tmp/project",
    "old-thread",
    fakeSpawn,
  );

  assert.deepEqual(result, {
    response: "Server is running",
    sessionId: "detached-thread",
  });
});

test("Solo adapters receive full local permissions", async () => {
  const claudeInvocations = [];
  const claudeSpawn = (command, args, options) => {
    claudeInvocations.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end() {} };
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(JSON.stringify({ result: "Done", session_id: "claude-session" })));
      child.emit("close", 0);
    });
    return child;
  };
  await AGENT_TYPES.claude_code.invoke("Prompt", "/tmp/project", "old-session", claudeSpawn, {
    workspaceWrite: true,
    fullAccess: true,
  });
  assert.ok(claudeInvocations[0].args.includes("Read,Grep,Glob,LS,Edit,Write,Bash"));
  assert.ok(claudeInvocations[0].args.includes("--dangerously-skip-permissions"));

  const codexInvocations = [];
  const codexSpawn = (command, args, options) => {
    codexInvocations.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end() {} };
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from([
        JSON.stringify({ type: "thread.started", thread_id: "codex-session" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Done" } }),
      ].join("\n")));
      child.emit("close", 0);
    });
    return child;
  };
  await AGENT_TYPES.codex_cli.invoke(
    "Prompt",
    "/tmp/project",
    "old-thread",
    codexSpawn,
    { workspaceWrite: true, networkAccess: true, fullAccess: true },
  );
  assert.ok(codexInvocations[0].args.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.ok(!codexInvocations[0].args.includes("--approve-for-me"));
});

test("Codex first invocation tries the latest project session before creating one", async () => {
  const invocations = [];
  const fakeSpawn = (command, args, options) => {
    invocations.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end() {} };
    queueMicrotask(() => {
      if (invocations.length === 1) {
        child.stderr.emit("data", Buffer.from("no sessions found"));
        child.emit("close", 1);
        return;
      }
      child.stdout.emit("data", Buffer.from([
        JSON.stringify({ type: "thread.started", thread_id: "created-thread" }),
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "Started fresh" },
        }),
      ].join("\n")));
      child.emit("close", 0);
    });
    return child;
  };

  const result = await AGENT_TYPES.codex_cli.invoke(
    "Prompt",
    "/tmp/project",
    null,
    fakeSpawn,
  );

  assert.equal(invocations.length, 2);
  assert.ok(invocations[0].args.includes("--last"));
  assert.equal(invocations[0].options.cwd, "/tmp/project");
  assert.ok(!invocations[1].args.includes("resume"));
  assert.deepEqual(result, {
    response: "Started fresh",
    sessionId: "created-thread",
  });
});
