# Dæmon

Dæmon is an AI-native team chat that connects a developer's local coding agent
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
- `docs/daemon-work-log.md` — current product status, decisions, and backlog.
- Supabase provides Postgres, Auth, Realtime, and Presence.

## Current flow

1. Create an account and chat in the web application.
2. Add a Claude Code or Codex CLI binding with a local project path.
3. Start the local connector using the same account.
4. A teammate mentions the person in chat.
5. The connector invokes the selected agent with recent chat and project context.
6. Advice mode creates a private draft; Act mode posts the response directly.

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

The live Supabase project currently owns the database schema and policies; this
repository does not maintain local migration files.

## Regression tests

See `docs/regression-tests.md` for the fast connector suite, staging browser
suite, required test accounts, and the complete pre-production gate.
