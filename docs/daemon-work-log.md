# Dæmon — Work Log & Product Backlog
*Treat this as the source of truth. Update after every session.*

---

## Product Positioning

**For** developers and their teams already working with AI coding agents
**Who** are tired of manually relaying answers between their agent and their teammates
**Dæmon** is an AI-native team chat
**That** lets your agent join the conversation as you, learning when to answer, draft, or stay quiet
**Unlike** Slack/Teams bolting on a generic bot, or Claude Code/Cursor working alone in your terminal
**Our product** makes your agent's judgment a trust that's earned through real use, not just another feature to copy.

---

## The Secret

The unit of work is shifting from person → person+agent. The unsolved bottleneck isn't capability — it's **judgment**: knowing when to speak, when to draft and wait, when to stay silent. That judgment has to be learned per person, per relationship, over time — which means memory isn't a feature, it's the substrate judgment runs on.

---

## What's Done ✅

| Feature | Notes |
|---|---|
| Auth (email/password signup → person row via trigger) | Confirmed working. Email confirmation disabled for dev. |
| Chat creation + listing | Working. |
| Invite by email | `find_person_by_email` RPC. Working. |
| Real-time messaging (human → human) | Supabase Realtime via WAL. Confirmed across two separate browsers. |
| Agent binding registration UI | Person selects Claude Code or Codex CLI, configures a label and project path, and stores it in `agent_binding`. |
| @ mention autocomplete | Dropdown on `@`, picks from chat members, inserts `message_mention` row(s) at send time. Handles multiple mentions per message. |
| Connector: auth + binding fetch | Connector logs in, fetches all bindings for this person across all chats from DB. No per-binding env config. |
| Connector: dual subscription | Observes all messages (context), subscribes to `message_mention` for trigger. |
| Connector: multi-binding aware | One connector process manages all chats/agents for a person. |
| Agent type registry (`agent-types.js`) | Claude Code and Codex CLI are implemented behind the same invocation contract. Both are exposed in the binding UI. |
| Connector: mention detection + invocation | ✅ End-to-end real API-key test complete: mention received → prompt built → Claude Code invoked → response routed. |
| `last_seen` timestamp | Startup catch-up only fetches mentions since last processed. |
| Presence indicator | ✅ Green/grey status per binding using Supabase Presence and connector heartbeats. Expected disconnect delay is approximately 30–60 seconds. |
| Connector regression tests | Ten fast Node tests cover classification, prompt construction, Advice/Act/Judgment routing, safe fallbacks, pause/resume, catch-up safety, trust-event semantics, and Claude/Codex invocation and continuity. Keep these running during MVP development. |
| Codex CLI adapter | ✅ On first mention, resumes the most recent Codex session scoped to the binding's project directory; if none exists, creates one. The resulting JSONL `thread_id` is then persisted per binding and resumed exactly. Execution is forced to `read-only` with approvals disabled. |
| Connector browser authorization | ✅ `groupwork-connect login` opens the signed-in web app for explicit loopback authorization. The connector stores refreshable session tokens with `0600` permissions and never receives or stores the user's password. Logout removes the local session. |
| Connector private-beta package | ✅ Runtime-only npm tarball created and installed successfully in an isolated prefix. Both `groupwork-connect` and legacy `daemon-connect` bins work. The website `/connector` page provides download and setup instructions. Public npm publication remains gated on the final package name, deployed app URL, and a second physical-machine UAT. |
| Connector doctor | ✅ Checks saved login, Supabase identity, bindings, required Claude/Codex installation, local project paths, and website reachability before start. |
| Sent-agent-message correction | Owners can edit a response their agent already posted. The corrected text is visible to the chat, marked `Edited by [owner]`, and the first edit records `corrected_after_send` with topic and word-level edit distance so Judgment demotes that topic. |
| Atomic correction RPC | `edit_agent_message` validates ownership, updates the agent message, and records the first `corrected_after_send` event in one PostgreSQL transaction. SQL runbook: `docs/sql/edit-agent-message-atomic.sql`. |
| Auth/session hardening | Next.js 16 `proxy.ts` refreshes Supabase sessions and protects `/chats`; authenticated users are redirected away from `/auth`. Signup normalizes input and handles both immediate sessions and future email-confirmation mode. |
| Chat-list cleanup | Clearer page hierarchy, contained create form, consistent conversation cards/actions, responsive spacing, empty state, and typed relation mapping. |

---

## Product Backlog (ordered by value)

### P0 — Needed to close the core loop and demo the product

| # | Item | What it is | Depends on |
|---|---|---|---|
| 1 | ✅ **Real API key test (Claude Code)** | End-to-end mention → Claude Code invocation against the real project → routed response confirmed working. | — |
| 3 | ✅ **Private thread UI** | Sidebar panel shows agent drafts with send / edit / cancel / handle-myself actions. Captures `first_viewed_at`, `edit_distance`, `response_time_ms`, `judgment_event` rows on every action. | — |
| 4 | ✅ **RLS policies for `private_thread_message`** | Added in migration 010. Person can read/write own private thread. | — |
| 5 | ✅ **Mode toggle in UI** | Pill segmented control (Advice \| Act) per agent binding. Optimistic update — flips instantly, reverts on DB failure. Agent modal moved to sidebar "+ add" button. | — |

### P1 — Makes the product feel real and trustworthy

| # | Item | What it is | Depends on |
|---|---|---|---|
| 6 | ✅ **Presence indicator** | Green/grey dot per agent binding showing whether the connector is currently running. Implemented with Supabase Presence and a 15-second connector heartbeat. | — |
| 7 | ✅ **Judgment event logging** | Private thread actions write real `judgment_event` rows for send/edit/cancel/handle-myself. Automatic Act delivery deliberately records no positive trust signal, preventing self-reinforcing promotion. | — |
| 8 | ✅ **RLS policies for `judgment_event`, `topic_trust`** | Migration 014. | — |
| 9 | ✅ **Connector pause/resume** | `daemon-connect pause` / `resume` — local state file, checked before every agent invocation. Shown on startup if left paused. | — |
| 10 | ✅ **Startup catch-up: auto-process missed mentions** | Missed mentions are processed on startup and forcibly routed through Advice mode so stale batches never auto-post unattended. | #3 |

### P2 — Core product differentiation (the actual secret, built on top of proven loop)

| # | Item | What it is | Depends on |
|---|---|---|---|
| 11 | ✅ **Basic rule engine (`decide_topic_mode`)** | Judgment mode evaluates recent human judgment events per topic. Three consecutive unedited approvals earn Act; other signals break the streak. Automatic Act sends do not reinforce trust. | #7 |
| 12 | ✅ **Topic tagging** | Connector classifies mentions with keyword-based question types and topic tags before routing. | #11 |
| 13 | **Pairwise relationship trust (chemistry model)** *(deferred until real usage)* | True per-person-pair trust links instead of category-based. Do not design this against synthetic data; revisit once real teams generate meaningful interaction volume. | #11 + real users |
| 14 | **Connector-advertised project paths** *(deferred to desktop app)* | Path discovery and native folder selection belong in desktop onboarding. Keep the web MVP's free-text project path until then. | #21 |

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
| 23 | **Multi-agent per person per chat** | Schema unique constraint (person, chat) currently enforces one binding. Relax when multi-agent use cases are proven. |
| 24 | **UI redesign** | Current UI is functional but unstyled. Redesign is a pure CSS/className change — no logic touch — estimated 1-2 days with a clear design direction. |
| 25 | **Rename product** | "dæmon" → something simpler floated. Deferred. |
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
| Connector is a thin relay — no intelligence | All product logic (judgment, routing, mode) lives in the web app. Connector: subscribe → invoke → relay |
| Agent type + project path stored in DB, not .env | One connector process manages all a person's bindings across all chats |
| @ mention autocomplete resolves to person_id | UI handles disambiguation (two Nanas), DB stores resolved ID — no text parsing needed |
| `message_mention` join table (not a column) | Correctly handles multiple mentions per message. Many-to-many = join table |
| Judgment mode is the concurrency control | Act = dev is off the clock (single consumer of session). Advice = human gates when resume fires. No infrastructure locking needed. |
| Renamed Suggested/Auto → Advice/Act | Clearer product language. Required a full enum migration (`response_mode` type) since the DB enum was never updated when the app-level naming changed — this caused a real bug (silent insert failures on every agent message) until caught and fixed in migration 015. |
| Agent message attribution: "Sent by [Name]'s dæmon" | Shown under every agent-sent message, visible to all chat members, not just the sender. "On behalf of" was considered but rejected — inaccurate tense for something already sent. |
| Connector-owned Claude Code session (separate session_id) | Avoids race condition with interactive session. `--resume` provides continuity within dæmon-triggered Q&A specifically |
| Read-only enforcement via `--allowedTools` (Claude Code) | Hard-coded at connector spawn level, not per-message. Write capability deliberately not offered |
| Codex CLI is the second supported runtime | Proves the product loop is platform-neutral while staying focused on two widely used developer agents. |
| Project directory is the initial agent-context boundary | Claude uses its directory-scoped continuation behavior; Codex first tries `exec resume --last` from that directory. Once attached or created, the connector stores the exact session/thread ID per binding. |
| Codex connector sessions are read-only | `codex exec --json` supplies a durable thread ID; subsequent mentions resume it. `--sandbox read-only` and `--ask-for-approval never` prevent unattended repository writes or blocked approval prompts. |
| Shared artifacts solve agent handoff, not generic storage | Do not sync project folders or build a Drive clone. Share small, conversation-scoped work products across otherwise isolated agents; keep committed code and branches in GitHub. |
| Attachments before MCP | First prove the handoff through chat attachments delivered by the connector. An MCP surface (`list/read/publish_chat_artifact`) is a later interoperability layer, not a prerequisite. |
| Browser approval instead of connector passwords | Distribution must never require copying a groupwork password into `.env`. A short-lived loopback authorization transfers the existing browser session to the explicitly approved local CLI and stores it with restricted permissions. |

## Session Notes — Post-restore fixes

- **Regression testing scope for MVP:** keep the ten fast connector tests and
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
- **Topic continuity beyond keywords** — current deterministic classifier is
  intentionally lightweight but misses pronoun-heavy follow-ups. Do not add a
  local classification model yet: it would increase connector installation
  size, resource usage, latency, and operational complexity before real usage
  proves it necessary. First try conservative continuity rules; revisit a small
  local or hosted model only with measured misclassification data.

## Schema Reality-Check Log

- ✅ Auth→person sync trigger working. Real signup form passes `display_name` via metadata correctly.
- ✅ Email confirmation disabled (Supabase Auth dashboard setting). Re-enable before external users.
- ✅ Data API was disabled — caused silent empty query results. Enabled and confirmed working.
- ✅ RLS gap: `003_rls_policies.sql` — policies for `person`, `chat`, `chat_member`, `message`.
- ✅ RLS gap: invite policy (`005`) — existing-member-can-invite-others was missing.
- ✅ RLS gap: person visibility (`006`/`007`) — chat-mates can see each other's person rows. Fixed recursion via `current_person_id()` helper function.
- ✅ `008` — `message_mention` join table + `agent_binding` RLS policies.
- ✅ `009` — `project_path` column on `agent_binding`.
- ⚠️ RLS policies for `private_thread_message`, `topic_trust`, `judgment_event`, `agent_binding` (update/presence) — enabled but zero policies = fully locked. Add as each feature is built.
- ⚠️ Replication enabled for: `message`, `message_mention`, `agent_binding`. Verify `private_thread_message` is enabled when private thread UI is built.
