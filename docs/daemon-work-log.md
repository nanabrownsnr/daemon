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
| Agent binding registration UI | Person configures a Claude Code label and project path → stored in `agent_binding`. Claude Code is the only exposed agent type. |
| @ mention autocomplete | Dropdown on `@`, picks from chat members, inserts `message_mention` row(s) at send time. Handles multiple mentions per message. |
| Connector: auth + binding fetch | Connector logs in, fetches all bindings for this person across all chats from DB. No per-binding env config. |
| Connector: dual subscription | Observes all messages (context), subscribes to `message_mention` for trigger. |
| Connector: multi-binding aware | One connector process manages all chats/agents for a person. |
| Agent type registry (`agent-types.js`) | Claude Code invocation is implemented. Additional agent types remain backlog work and are not exposed in the UI. |
| Connector: mention detection + invocation | ✅ End-to-end real API-key test complete: mention received → prompt built → Claude Code invoked → response routed. |
| `last_seen` timestamp | Startup catch-up only fetches mentions since last processed. |
| Presence indicator | ✅ Green/grey status per binding using Supabase Presence and connector heartbeats. Expected disconnect delay is approximately 30–60 seconds. |
| Connector regression tests | Eight fast Node tests cover classification, prompt construction, Advice/Act/Judgment routing, safe fallbacks, pause/resume, catch-up safety, trust-event semantics, and Claude invocation parsing. Keep these running during MVP development. |

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
| 22 | **Additional agent adapters** | Goose (Block), Ollama, others. Architecture supports it via `agent-types.js` — just add an entry. |
| 23 | **Multi-agent per person per chat** | Schema unique constraint (person, chat) currently enforces one binding. Relax when multi-agent use cases are proven. |
| 24 | **UI redesign** | Current UI is functional but unstyled. Redesign is a pure CSS/className change — no logic touch — estimated 1-2 days with a clear design direction. |
| 25 | **Rename product** | "dæmon" → something simpler floated. Deferred. |

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

## Session Notes — Post-restore fixes

- **Regression testing scope for MVP:** keep the eight fast connector tests and
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
- **Judgment UAT prepared:** `docs/judgment-uat-2.md` defines a two-person test
  for promotion, cold-topic isolation, non-self-reinforcement, and demotion.
  `npm run uat:analyze -- "uat 2"` performs a read-only event/decision analysis.
- **Plan, not yet executed:** once P2 (rule engine) is built and stable, do
  a full data wipe and re-test with clean, deliberate test scenarios rather
  than accumulated ad-hoc testing data. Don't do this now — current messy
  data is still useful for finding bugs like the ones above.

## Open Questions

- **No org/workspace concept yet** — profile visibility and billing both eventually need "same company" as a boundary, not just "same chat"
- **Soft-delete vs hard-delete for persons** — judgment history is a long-term asset, shouldn't be casually destroyable
- **Shared session vs dedicated session for Claude Code** — dedicated session (current) avoids race conditions but doesn't inherit interactive reasoning. Empirical concurrency test (real Anthropic auth) still not run. Low priority until dedicated session is proven insufficient.
- **Agent-to-agent loop prevention** — needed once any auto-triggering beyond explicit mention exists

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
