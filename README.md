# groupwork

groupwork is an AI-native team chat that connects a developer's local coding agent
to conversations with their team. A person can bind Claude Code or Codex CLI to a chat,
receive agent-generated drafts privately, or allow trusted responses to post
directly.

## Architecture

- `app/` — Next.js web application for authentication, chats, mentions, agent
  bindings, Advice/Act controls, private drafts, and presence.
- `connector/` — packageable local Node.js relay that is authorized through the
  signed-in web app, listens
  for mentions, invokes the selected agent in the configured project, and routes the
  response.
- `docs/groupwork-work-log.md` — current product status, decisions, and backlog.
- `docs/private-beta-launch.md` — email-confirmation, database, deployment, and
  second-computer acceptance checklist.
- Supabase provides Postgres, Auth, Realtime, and Presence.

## Current flow

1. Create an account and chat in the web application.
2. Add a Claude Code or Codex CLI binding with a local project path.
3. Start the local connector using the same account.
4. A Team mention creates an execution request for the agent owner to Accept or
   Reject; a Solo mention is immediately authorized by its owner.
5. The connector invokes the selected agent with recent chat and project context.
6. Advice mode creates a private draft; Act mode posts the response directly;
   Judgment chooses between them from learned topic trust.

## Development

The web application and connector have separate Node.js packages:

```bash
cd app
npm install
npm run dev
```

```bash
cd connector
npm install
node src/cli.js start
```

The selected agent CLI must be installed and authenticated on the machine
running the connector. Normal connector installations need no `.env` file and
never store the user's groupwork password; run `groupwork-connect login` to
authorize the computer through the web app.

The live Supabase project currently owns the baseline database schema and
policies. Incremental SQL runbooks for current features live in `docs/sql/` and
must be applied in Supabase before deploying matching application changes.

## Regression tests

See `docs/regression-tests.md` for the fast connector suite, staging browser
suite, required test accounts, and the complete pre-production gate.
