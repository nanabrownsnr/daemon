import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// connector.js validates these at import time but does not connect until start().
process.env.DAEMON_SUPABASE_URL ??= "https://regression.invalid";
process.env.DAEMON_SUPABASE_ANON_KEY ??= "regression-key";
process.env.DAEMON_EMAIL ??= "regression@example.com";
process.env.DAEMON_PASSWORD ??= "regression-password";
process.env.DAEMON_CONFIG_DIR = mkdtempSync(join(tmpdir(), "daemon-regression-"));

const { classifyQuestion, buildPrompt, routeResponse, pause, resume } = await import("../src/connector.js");
const { AGENT_TYPES } = await import("../src/agent-types.js");

function responseQuery(data) {
  return {
    select() { return this; },
    eq() { return this; },
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

test("pause and resume persist connector state", () => {
  pause();
  assert.equal(JSON.parse(readFileSync(join(process.env.DAEMON_CONFIG_DIR, "state.json"), "utf8")).paused, true);
  resume();
  assert.equal(JSON.parse(readFileSync(join(process.env.DAEMON_CONFIG_DIR, "state.json"), "utf8")).paused, false);
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
  assert.match(prompt, /Do not invent decisions, commitments, deadlines, approvals/);
});

test("Advice creates a private draft with classification and trigger", async () => {
  const db = routingClient();
  await routeResponse(db, "person-1", { id: "binding-1", mode: "advice" }, "chat-1", "Draft", {
    topicTag: "api", questionType: "technical",
  }, "trigger-1");
  assert.deepEqual(db.inserts, [{
    table: "private_thread_message",
    row: {
      chat_id: "chat-1", person_id: "person-1", sender_type: "agent", body: "Draft",
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
  assert.ok(invocation.args.includes("never"));
  assert.ok(invocation.args.includes("resume"));
  assert.deepEqual(
    invocation.args.slice(-3),
    ["--skip-git-repo-check", "old-thread", "Prompt"],
  );
  assert.equal(invocation.options.cwd, "/tmp/project");
  assert.deepEqual(result, { response: "Done from Codex", sessionId: "new-thread" });
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
