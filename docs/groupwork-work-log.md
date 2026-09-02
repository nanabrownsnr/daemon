# groupwork — Work Log & Product Backlog
*Treat this as the source of truth. Update after every session.*

---

## Product Positioning

**For** developers and their teams already working with AI coding agents
**Who** are tired of manually relaying answers between their agent and their teammates
**groupwork** is an AI-native team chat
**That** lets your agent join the conversation as you, learning when to answer, draft, or stay quiet
**Unlike** Slack/Teams bolting on a generic bot, or Claude Code/Cursor working alone in your terminal
**Our product** makes your agent's judgment a trust that's earned through real use, not just another feature to copy.

---

## The Secret

The unit of work is shifting from person → person+agent. The unsolved bottleneck isn't capability — it's **judgment**: knowing when to speak, when to draft and wait, when to stay silent. That judgment has to be learned per person, per relationship, over time — which means memory isn't a feature, it's the substrate judgment runs on.

## MVP Product Guardrails

- **Team is the core product:** a human brings one project-bound agent into a
  team conversation; other people request its help through that human.
- **Solo is a proving workspace:** one human may coordinate multiple named
  agents, but agents do not autonomously trigger one another.
- **Execution and publication are separate:** Team work requires owner Accept
  before reaching the local runtime; Advice/Act/Judgment determines whether the
  resulting response needs review before entering the shared chat.
- **The platform owns judgment and shared context:** connectors execute local
  work; they do not independently decide trust, approval, routing, or summaries.
- **Git remains the source of truth for code:** groupwork coordinates discussion
  and handoff rather than syncing whole project directories.

---

## What's Done ✅

| Feature | Notes |
|---|---|
| Auth (email/password signup → person row via trigger) | Confirmed working. Email confirmation disabled for dev. |
| Chat creation + listing | Working. |
| Invite by email | `find_person_by_email` RPC. Working. |
| Real-time messaging (human → human) | Supabase Realtime via WAL. Confirmed across two separate browsers. |
| Agent binding registration UI | Person selects Claude Code or Codex CLI, configures a label and project path, and stores it in `agent_binding`. |
| @ mention autocomplete | Team chats target members through `message_mention`; Solo chats target exact persistent agent bindings through `message_agent_mention`. Handles multiple structured mentions per message. |
| Connector: auth + binding fetch | Connector logs in, fetches all bindings for this person across all chats from DB. No per-binding env config. |
| Connector: gated Team + direct Solo subscriptions | Observes chat context, consumes owner-approved Team run requests, and invokes exact Solo bindings directly. |
| Connector: multi-binding aware | One connector process manages all chats/agents for a person. Team mentions resolve the person's single chat binding; Solo mentions route by exact binding ID so agents never replace one another. |
| Agent type registry (`agent-types.js`) | Claude Code and Codex CLI are implemented behind the same invocation contract. Both are exposed in the binding UI. |
| Connector: mention detection + invocation | ✅ End-to-end real API-key test complete: mention received → prompt built → Claude Code invoked → response routed. |
| Per-binding catch-up cursor | Startup catch-up fetches only mentions not successfully processed by that exact binding. One agent cannot advance another agent's cursor. |
| Presence indicator | ✅ Green/grey status per binding using Supabase Presence and connector heartbeats. Expected disconnect delay is approximately 30–60 seconds. |
| Connector regression tests | Twenty-four fast Node tests cover deterministic and local semantic classification, highest-score ordering, single-flight/non-blocking model warm-up, catalog versioning/evidence, layered summary/recent-context prompts, Team/Solo routing, per-binding execution serialization, permission boundaries, Advice/Act/Judgment, safe fallbacks, pause/resume, catch-up safety, trust-event semantics, and Claude/Codex continuity. Keep these running during MVP development. |
| Per-binding execution queue | ✅ Invocations for one binding are serialized so a second mention cannot concurrently resume the same Claude/Codex session. Different bindings remain concurrent. |
| Atomic message + mention delivery | ✅ `send_message_with_mentions` validates chat membership and Team/Solo targets, then stores the human message and all structured mentions in one transaction. SQL: `docs/sql/send-message-atomic.sql`. |
| Chat GitHub project context | ✅ Chat owners can attach a validated GitHub repository URL. The link is visible in the chat header and included in every connector prompt with an explicit reminder that local credentials still control pull/push access. SQL: `docs/sql/chat-github-link.sql`. |
| Cross-platform CLI launch diagnostics | ✅ Windows `.cmd` executable resolution is used for Claude Code and Codex CLI, and `doctor` checks the platform-specific executable. Missing CLI errors now identify the exact CLI to install instead of only reporting `ENOENT`. |
| Versioned local semantic topic classification | ✅ Connector 0.7.2 prepares a pinned quantized MiniLM embedding model in the background, pulls platform-owned topic definitions by catalog version, compares mention context locally, and records immutable per-message/per-binding classifications. It selects the highest cosine-similarity candidate and logs the top three scores; a highest score below 0.340 conservatively records `general`. Download, load, refresh, offline, queue saturation, and inference failures immediately use the deterministic fallback; they never block agent work. A clean Linux install measured about 407 MB plus a 23 MB model cache. SQL: `docs/sql/topic-classification.sql`. |
| Agent presence + working indicator | ✅ Binding dots have one job: green when the connector is online and grey when offline. While an agent is executing, a three-dot typing bubble appears in the conversation; one complete response appears when the run finishes. |
| Incremental connector prompts | ✅ Each binding stores its own successful context cursor and receives only new chat messages on later turns, while first invocation retains a bounded 15-message context window. The target message is not duplicated in context. |
| Platform-owned running chat summary | ✅ A Supabase Database Webhook wakes the `summarize-chat` Edge Function after message inserts. The first summary waits for two distinct speakers; subsequent messages refresh it incrementally. PostgreSQL atomically claims each block, and an independent OpenRouter model produces shared goal/decision/state/task/handoff context. Connectors only read the stored summary plus their raw delta. Failures never block chat or agent work. SQL: `docs/sql/chat-context-summary.sql`; setup: `docs/platform-chat-summaries.md`. |
| Owner execution gate | ✅ Team mentions create pending Agent Workspace requests and do not reach the connector until the agent owner chooses **Accept** or **Reject**. Accept explicitly grants the local runtime terminal-equivalent host permissions for that request; requests are atomically claimed once. Execution and publication remain separate controls. SQL: `docs/sql/team-run-approval.sql`. |
| Solo execution permissions | ✅ Explicit Solo mentions authorize native-style full local execution for Claude/Codex: files, commands, validation, host processes and ports across invocations, and network access. This deliberately bypasses the Codex sandbox and Claude permission prompts on the connector computer; the binding UI requires an explicit acknowledgement. |
| Solo multi-agent workspace | ✅ Live Claude/Codex UAT complete: persistent labeled bindings, agent-only `@` targeting, independent sessions/project paths/modes/presence, binding-specific prompts, and per-agent Agent Workspace tabs. Autonomous agent-to-agent triggering is deliberately excluded. |
| Codex CLI adapter | ✅ On first mention, resumes the most recent Codex session scoped to the binding's project directory; if none exists, creates one. The resulting JSONL `thread_id` is persisted per binding and resumed exactly. Solo and accepted Team work use native-style full local access. Completed JSONL turns return immediately even when a detached server keeps inherited streams open. |
| Codex sandbox compatibility | ✅ Read-only adapter calls retain the Codex sandbox. Authorized Solo and accepted Team work deliberately use the runtime's native full-access automation mode, matching the execution consent shown in the UI. |
| Connector browser authorization | ✅ `groupwork-connect login` opens the signed-in web app for explicit loopback authorization. The connector stores refreshable session tokens with `0600` permissions and never receives or stores the user's password. Logout removes the local session. |
| Connector private-beta package | ✅ Runtime-only npm tarball created and installed successfully in an isolated prefix. The canonical `groupwork-connect` CLI and website `/connector` download/setup instructions are ready. Connector 0.7.2 adds idle zero-binding startup to the 0.7.1 feature set. Public npm publication remains optional and gated on a deployed app URL plus second physical-machine UAT. |
| Connector doctor | ✅ Checks saved login, Supabase identity, required topic-catalog schema/version, bindings, Claude/Codex installation, local project paths, and website reachability before start. |
| Zero-binding idle startup | ✅ The connector remains connected with no bindings, listens for live binding inserts, and activates agents added later from the web UI without a terminal restart. |
| Sent-agent-message correction | Owners can edit a response their agent already posted. The corrected text is visible to the chat, marked `Edited by [owner]`, and the first edit records `corrected_after_send` with topic and word-level edit distance so Judgment demotes that topic. |
| Atomic correction RPC | `edit_agent_message` validates ownership, updates the agent message, and records the first `corrected_after_send` event in one PostgreSQL transaction. SQL runbook: `docs/sql/edit-agent-message-atomic.sql`. |
| Auth/session hardening | Next.js 16 `proxy.ts` refreshes Supabase sessions and protects `/chats`; authenticated users are redirected away from `/auth`. Signup normalizes input and handles both immediate sessions and future email-confirmation mode. |
| Chat-list cleanup | Clearer page hierarchy, contained create form, consistent conversation cards/actions, responsive spacing, empty state, and typed relation mapping. |

---

## Private-beta launch gate

- **Current state (2026-09-02): ready to enter MVP UAT after the operator applies
  the seven SQL runbooks and deploys the matching app/connector 0.7.2.** Feature
  scope is frozen; failures found in UAT take priority over new features.
- [ ] Keep signup limited to known private testers. Before opening signup externally, configure custom SMTP, enable email confirmation, point the Confirm signup template at `/auth/confirm`, and verify a new account lands in connector onboarding.
- [ ] Apply the current SQL runbooks and rehearse Team Accept, Solo multi-agent targeting, atomic sends, correction/demotion, and connector catch-up.
- [ ] Deploy the web app and verify browser authorization uses its HTTPS origin.
- [ ] Install connector 0.7.2 on a second physical computer; verify non-blocking first model download and conversation working indicators, then run login, doctor, start, pause, resume, and logout.
- [ ] Run the fast connector suite, launch-critical Playwright flow, TypeScript, lint, and production build.
- [ ] Verify two-user RLS boundaries and rotate any credential exposed during development.
- [x] Keep the connector alive with zero bindings and activate bindings added later from the web UI without requiring a terminal restart.
- [ ] Add device-scoped binding ownership or an atomic invocation claim before allowing one account to run connectors on multiple computers simultaneously.

Resolved UAT finding: `groupwork-connect start` now remains running in an idle
state when the authenticated person has no bindings. The existing binding
subscription activates agents added later in the web UI, so a new user can
start and minimize the connector terminal once without returning to restart it.

Current topology boundary: one active connector computer per groupwork account.
Every connector presently subscribes to every binding owned by that person, so
two simultaneous connectors for one account can both consume the same Solo
mention. The two-laptop founder test must use two accounts in a Team chat until
bindings are assigned to devices or invocation delivery is atomically claimed.

Formally accepted private-beta exception (2026-09-02):
`@huggingface/transformers` currently brings four high-severity transitive npm
advisories through `onnxruntime-node`/`adm-zip` and `sharp`, with no upstream fix
available in the installed line. The connector's text-only classifier does not
accept user ZIP/image inputs, limiting the identified attack paths. This is
accepted only for the known-tester private beta; it must be upgraded, replaced,
or re-reviewed before public npm distribution and is not an accepted public
production risk.

Feature scope is frozen for this gate. Pairwise trust, learned inbound approval,
shared artifacts, organizations/billing, desktop packaging, push notifications,
and autonomous agent loops remain post-MVP.

## Product Backlog (ordered by value)

### P0 — Needed to close the core loop and demo the product

| # | Item | What it is | Depends on |
|---|---|---|---|
| 1 | ✅ **Real API key test (Claude Code)** | End-to-end mention → Claude Code invocation against the real project → routed response confirmed working. | — |
| 3 | ✅ **Private thread UI** | Sidebar panel shows agent drafts with send / edit / cancel / handle-myself actions. Captures `first_viewed_at`, `edit_distance`, `response_time_ms`, `judgment_event` rows on every action. | — |
| 4 | ✅ **RLS policies for `private_thread_message`** | Added in migration 010. Person can read/write own private thread. | — |
| 5 | ✅ **Mode control in UI** | Compact Advice / Act / Judgment dropdown per agent binding. Optimistic update applies instantly and reverts on DB failure. Agent modal lives behind the sidebar "+ add" action. | — |

### P1 — Makes the product feel real and trustworthy

| # | Item | What it is | Depends on |
|---|---|---|---|
| 6 | ✅ **Presence indicator** | Green/grey dot per agent binding showing whether the connector is currently running. Implemented with Supabase Presence and a 15-second connector heartbeat. | — |
| 7 | ✅ **Judgment event logging** | Private thread actions write real `judgment_event` rows for send/edit/cancel/handle-myself. Automatic Act delivery deliberately records no positive trust signal, preventing self-reinforcing promotion. | — |
| 8 | ✅ **RLS policies for `judgment_event`, `topic_trust`** | Migration 014. | — |
| 9 | ✅ **Connector pause/resume** | `groupwork-connect pause` / `resume` — local state file, checked before every agent invocation. Shown on startup if left paused. | — |
| 10 | ✅ **Startup catch-up: auto-process missed mentions** | Missed mentions are processed on startup and forcibly routed through Advice mode so stale batches never auto-post unattended. | #3 |

### P2 — Core product differentiation (the actual secret, built on top of proven loop)

| # | Item | What it is | Depends on |
|---|---|---|---|
| 11 | ✅ **Basic rule engine (`decide_topic_mode`)** | Judgment mode evaluates recent human judgment events per topic. Three consecutive unedited approvals earn Act; other signals break the streak. Automatic Act sends do not reinforce trust. | #7 |
| 12 | ✅ **Topic tagging** | Connector uses a pinned local MiniLM embedding model against the platform's versioned topic catalog. Results are stored per message/binding with model, catalog, source and confidence metadata. Keyword classification remains the non-blocking fallback. | #11 |
| 13 | **Pairwise relationship trust (chemistry model)** *(deferred until real usage)* | True per-person-pair trust links instead of category-based. Do not design this against synthetic data; revisit once real teams generate meaningful interaction volume. | #11 + real users |
| 14 | **Connector-advertised project paths** *(deferred to desktop app)* | Path discovery and native folder selection belong in desktop onboarding. Keep the web MVP's free-text project path until then. | #21 |
| 27 | **Learned request approval setting** *(deferred until real Team data)* | A settings page will separate inbound execution (`Always ask` vs learned trust) from outbound publication (Advice/Act/Judgment). MVP keeps Team execution on manual Accept because automatic full-host execution needs relationship, topic and risk evidence. | #11 + real users |

### P3 — Scale and polish (post-MVP)

| # | Item | What it is |
|---|---|---|
| 15 | **Billing unit table** | `(person + agent identity)` as billable unit, reusable across chats. Schema not yet built. |
| 16 | **Org/workspace layer** | No "organisation" concept yet — only chats. Needed for profile visibility beyond shared chats, and for billing (who belongs to which account). |
| 17 | **Push notifications** | In-app badge when in a different chat; OS-level push when app is closed. Same delivery system should serve human messages AND agent events. |
| 18 | **Soft-delete / deactivate person** | Currently deleting a Supabase auth user orphans the `person` row. Should deactivate rather than hard-delete (judgment history is a long-term asset). |
| 19 | **Email confirmation re-enable** | Currently disabled for dev. Must re-enable before any external users. |
| 20 | **Agent-to-agent loop circuit breaker** | Once auto-triggering exists beyond explicit mention, need a max-hop-count or "agents can't mention each other without a human-initiated thread" rule. |
| 21 | **Desktop app / native file picker** | For smoother connector onboarding (select folder, pick agent type, done). Deferred until loop is proven. |
| 22 | ✅ **Second agent adapter: Codex CLI** | Codex CLI now shares the connector, prompt, routing, session persistence, presence, and Judgment pipeline with Claude Code. Goose, Hermes, Ollama, and others remain future adapter work. |
| 23 | ✅ **Solo multi-agent chats** | Human-directed Claude/Codex UAT passed with explicit mentions, separate workspaces and persistent sessions. Autonomous agent-to-agent triggering remains deferred. |
| 24 | **UI redesign** | Current UI is functional but unstyled. Redesign is a pure CSS/className change — no logic touch — estimated 1-2 days with a clear design direction. |
| 25 | ✅ **Canonical groupwork identity** | Product copy, package identity, CLI, logs, configuration, storage keys and documentation now use groupwork. Connector 0.5.0 migrates existing `~/.daemon` state to `~/.groupwork`; legacy environment names are temporary compatibility fallbacks only. |
| 26 | **Shared chat artifacts / agent handoffs** | Deferred until after the MVP and Codex/Claude cross-platform UAT. Eventually share focused handoff artifacts—Markdown plans, API contracts, logs, test reports, screenshots or sample payloads—while GitHub remains the source of truth for code. Start with Supabase Storage + connector delivery; consider MCP later. |

---

## Major Decisions Log

| Decision | Reasoning |
|---|---|
| Build from scratch, not fork existing chat | Core secret (identity as person+agent) changes the data model itself — forking would fight the fork's own human-only schema |
| Stack: Next.js + Supabase | Speed for MVP — bundles realtime/db/auth; Postgres maps directly to schema |
| Agent bindings are context-scoped (per chat) | Trust/competence genuinely differs by context (dev channel vs client channel) |
| Billing unit = (person + agent identity), reusable across chats | Per-chat billing would over-charge for one agent used across many contexts |
| Judgment engine kept separate from agent adapter | Agent produces content; judgment decides if/how it reaches the chat |
| Connector is an execution relay, not the judgment engine | Judgment, approval state, routing, and summaries are platform-owned. The connector subscribes, claims approved work, invokes local runtimes, reads shared summaries, and relays results. |
| Agent type + project path stored in DB, not .env | One connector process manages all a person's bindings across all chats |
| @ mention autocomplete resolves to person_id | UI handles disambiguation (two Nanas), DB stores resolved ID — no text parsing needed |
| `message_mention` join table (not a column) | Correctly handles multiple mentions per message. Many-to-many = join table |
| Per-binding queues control session concurrency | Advice/Act/Judgment control publication, not invocation locking. The connector serializes work for each binding so one Claude/Codex session has one writer, while different bindings can run concurrently. |
| Renamed Suggested/Auto → Advice/Act | Clearer product language. Required a full enum migration (`response_mode` type) since the DB enum was never updated when the app-level naming changed — this caused a real bug (silent insert failures on every agent message) until caught and fixed in migration 015. |
| Agent message attribution: "Sent by [Name]'s groupwork" | Shown under every agent-sent message, visible to all chat members, not just the sender. "On behalf of" was considered but rejected — inaccurate tense for something already sent. |
| Connector-owned Claude Code session (separate session_id) | Avoids race condition with interactive session. `--resume` provides continuity within groupwork-triggered Q&A specifically |
| Execution approval is binary | Solo owner mentions imply full local execution on the connector computer. Team owners Accept or Reject the whole request; Accept grants the selected local runtime its normal terminal-equivalent permissions. Publication remains a separate Advice/Act/Judgment decision. |
| Codex CLI is the second supported runtime | Proves the product loop is platform-neutral while staying focused on two widely used developer agents. |
| Project directory is the initial agent-context boundary | Claude uses its directory-scoped continuation behavior; Codex first tries `exec resume --last` from that directory. Once attached or created, the connector stores the exact session/thread ID per binding. |
| Connector sessions use native runtime permissions after authorization | `codex exec --json` supplies a durable thread ID and subsequent mentions resume it. Solo mentions and accepted Team requests use the runtime's full local execution mode; unapproved Team requests never reach the runtime. |
| Shared artifacts solve agent handoff, not generic storage | Do not sync project folders or build a Drive clone. Share small, conversation-scoped work products across otherwise isolated agents; keep committed code and branches in GitHub. |
| Attachments before MCP | First prove the handoff through chat attachments delivered by the connector. An MCP surface (`list/read/publish_chat_artifact`) is a later interoperability layer, not a prerequisite. |
| Browser approval instead of connector passwords | Distribution must never require copying a groupwork password into `.env`. A short-lived loopback authorization transfers the existing browser session to the explicitly approved local CLI and stores it with restricted permissions. |

## Session Notes — Post-restore fixes

- ✅ **Final pre-UAT audit (2026-08-24):** all 23 connector tests, app lint,
  TypeScript, and the production Webpack build pass. Connector 0.7.1 installs
  from its downloadable tarball into an isolated directory and its CLI starts.
  Six Playwright scenarios are discoverable but the live suite remains reserved
  for the staging accounts because it mutates Supabase. No secrets are tracked.
  The founder two-laptop, one-real-project dogfood is now the launch gate.

- **Regression testing scope for MVP:** keep the twenty-three fast connector tests and
  run them after connector/judgment changes. The Playwright + live Supabase
  suite has been scaffolded and partially exercised, but stabilization is
  deliberately deferred until the UI and workflows stop changing rapidly.
  Return to `app/tests/e2e/work-log.spec.ts` before external beta/production;
  do not spend current MVP time chasing selector and live-environment timing
  failures. Use a short manual core-loop checklist for demos in the meantime.

- **Sandbox reset mid-session**: working directory was lost, rebuilt from
  files already delivered to outputs. No data lost, but worth zipping and
  saving a full backup locally on your end periodically going forward.
- Catch-up mentions now always force Advice mode regardless of binding's
  Act setting — prevents a burst of stale offline mentions from auto-posting
  unattended.
- Presence dot delay after killing connector is expected (server-side
  heartbeat timeout, ~30-60s, no instant disconnect signal) — added periodic
  re-track (15s) to keep our own state fresh, but the fundamental delay is
  inherent to how presence detection works, not fixable in our code.
- Agent message attribution footer now suppressed when `was_edited = true` —
  an edited draft is effectively human-authored, shouldn't say "sent by
  agent." Renamed "on behalf of" → "Sent by" (correct tense for a completed action).
- ✅ **Claude Code session continuity resolved:** the first connector call uses
  `--continue` to obtain the active session ID from Claude's JSON response. The
  connector stores that ID per binding and uses `--resume <session_id>` for
  subsequent calls, preserving continuity within the bound project.
- ✅ **Codex CLI adapter and continuity implemented:** the binding UI exposes
  Codex CLI. Its first call resumes the latest Codex session scoped to the
  configured project directory, falling back to a new session only when needed;
  subsequent calls resume the captured thread ID. Live new/resume commands and
  JSONL parsing were verified.
- ✅ **Claude empty-result recovery:** connector 0.7.1 consumes Claude's
  documented `stream-json` events. If the successful final result event has an
  empty `result` field after tool work, it recovers the final textual assistant
  message instead of discarding the run as “No response.” A regression fixture
  covers this exact output shape.
- **Next UAT:** repeat the core two-person workflow with one Codex binding and
  one Claude Code binding, have them collaborate on a useful GitHub-backed task,
  and inspect how accurately context and responsibility pass through groupwork.
- ✅ **Private-beta connector distribution prepared:** password-based `.env`
  login was removed; browser authorization, logout, doctor, runtime-only npm
  packaging, isolated installation, website setup/authorization routes, and a
  downloadable tarball are implemented. Protocol smoke testing confirmed token
  validation and `0600` local session permissions. Before npm publication, run
  the tarball on another person's physical computer and choose/claim the final
  registry package name.
- **Judgment UAT prepared:** `docs/judgment-uat-2.md` defines a two-person test
  for promotion, cold-topic isolation, non-self-reinforcement, and demotion.
  `npm run uat:analyze -- "uat 2"` performs a read-only event/decision analysis.
- **Judgment UAT finding:** per-topic promotion correctly chose Act on the
  fourth API mention after three unedited approvals. Delivery initially failed
  because the connector inserted legacy `message.mode = 'auto'` after the
  product enum had been renamed. The connector now inserts `message.mode =
  'act'`, with a regression assertion covering the exact stored value. A
  subsequent live mention confirmed `Judgment decided: act` followed by a
  successful direct chat post. Automatic delivery added no positive judgment
  event, so the self-reinforcement safeguard also held. Editing the sent agent
  response recorded `corrected_after_send`; the next API mention was correctly
  routed back to Advice. Promotion, Act delivery, non-self-reinforcement, and
  topic-specific demotion are all confirmed live.
- **Plan, not yet executed:** once P2 (rule engine) is built and stable, do
  a full data wipe and re-test with clean, deliberate test scenarios rather
  than accumulated ad-hoc testing data. Don't do this now — current messy
  data is still useful for finding bugs like the ones above.

## Open Questions

- **No org/workspace concept yet** — profile visibility and billing both eventually need "same company" as a boundary, not just "same chat"
- **Soft-delete vs hard-delete for persons** — judgment history is a long-term asset, shouldn't be casually destroyable
- **Concurrent interactive + groupwork use of the same agent session** — both
  Claude and Codex intentionally attach to the latest project session on first
  use, then pin its ID. Test what happens if the developer is actively using
  that same session while groupwork invokes it; define locking or a clear UI
  warning if either CLI cannot safely serialize access.
- **Agent-to-agent loop prevention** — needed once any auto-triggering beyond explicit mention exists
- **Topic continuity and catalog quality** — connector 0.7.1 now uses a local
  MiniLM embedding model with a deterministic non-blocking fallback. UAT should
  measure follow-up-message classification, false topic switches, confidence,
  cold-start behavior, and whether the initial platform catalog needs narrower
  or project-specific definitions before changing Judgment thresholds.

## MVP UAT evidence to capture

- A clean second-computer install, browser login, doctor output, first-start
  model behavior, connector lifecycle commands, and reconnect/catch-up.
- A two-person Team run from mention → owner Accept/Reject → local execution →
  Advice/Act/Judgment publication, including an owner correction and demotion.
- A Solo run addressing Claude and Codex independently and together, confirming
  separate queues, sessions, project paths, presence, and responses.
- Failed and unauthorized paths: invalid mention, rejected Team request,
  disconnected connector, agent CLI failure, and cross-user RLS reads/writes.
- Topic evidence: stored slug/source/confidence/model/catalog version plus the
  resulting `decide_topic_mode` decision for promotion and demotion scenarios.

## Schema Reality-Check Log

- ✅ Auth→person sync trigger working. Real signup form passes `display_name` via metadata correctly.
- ✅ Email confirmation disabled (Supabase Auth dashboard setting). Re-enable before external users.
- ✅ Data API was disabled — caused silent empty query results. Enabled and confirmed working.
- ✅ RLS gap: `003_rls_policies.sql` — policies for `person`, `chat`, `chat_member`, `message`.
- ✅ RLS gap: invite policy (`005`) — existing-member-can-invite-others was missing.
- ✅ RLS gap: person visibility (`006`/`007`) — chat-mates can see each other's person rows. Fixed recursion via `current_person_id()` helper function.
- ✅ `008` — `message_mention` join table + `agent_binding` RLS policies.
- ✅ `009` — `project_path` column on `agent_binding`.
- ✅ RLS policies for private drafts, judgment events, agent bindings, explicit agent mentions, run requests and summaries have been exercised in live UAT. The repository still needs a consolidated baseline migration before a fresh project can be reproduced from source alone.
- ✅ Realtime has been exercised for messages, edits, bindings, private drafts, explicit agent mentions, run requests and summaries. Publication membership should be rechecked during the clean database rehearsal.
- ✅ Deployed-domain signup and email confirmation redirect were exercised successfully on `groupwork-ai.vercel.app`; the confirmed user returned to the app with a valid session.
