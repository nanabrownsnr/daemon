# dæmon — Sprint 0

Foundations: schema + interfaces, no user-facing app yet. See `/docs` reference
docs (`daemon-product-one-pager.md`, `daemon-mvp-dev-plan.md`) for the model
this implements.

## Stack decision

- **Next.js** (app) + **Supabase** (Postgres, Realtime, Auth)
- Rationale: real-time chat, database, and auth in one platform; free tier
  covers MVP scale (1-3 users); Postgres maps directly to the relational
  schema below without translation. Swappable later if needed — nothing
  downstream depends on this choice beyond the schema being SQL.

## What's done (Sprint 0)

- [x] Core schema (`schema/001_init.sql`): person, chat, agent_binding
      (context-scoped from day one), message, private_thread_message,
      relationship_link (category-based for MVP), topic_trust, judgment_event
- [x] Agent adapter interface (`src/agents/agent-interface.ts`) — stub,
      Sprint 2 implements the real Claude Code adapter against this shape
- [x] Judgment engine interface (`src/lib/judgment.ts`) — stub, Sprint 4
      implements the actual rule logic

## Setup (when ready to run)

1. Create a Supabase project
2. Run `schema/001_init.sql` against it (SQL editor or migration tool)
3. `npx create-next-app@latest` in this directory, add `@supabase/supabase-js`
4. Wire Supabase client + auth (Sprint 1)

## Next: Sprint 1

Basic group chat — humans only, no agents yet. See `daemon-mvp-dev-plan.md`.

## Deliberately not touched yet

Multi-agent support, true pairwise relationship links (chemistry model),
ML-based judgment scoring, enterprise features. All real, all post-MVP.
