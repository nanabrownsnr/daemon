# Dæmon

Dæmon is an AI-native team chat that connects a developer's local Claude Code
agent to conversations with their team. A person can bind Claude Code to a chat,
receive agent-generated drafts privately, or allow trusted responses to post
directly.

## Architecture

- `app/` — Next.js web application for authentication, chats, mentions, agent
  bindings, Advice/Act controls, private drafts, and presence.
- `connector/` — local Node.js relay that authenticates with Supabase, listens
  for mentions, invokes Claude Code in the configured project, and routes the
  response.
- `docs/daemon-work-log.md` — current product status, decisions, and backlog.
- Supabase provides Postgres, Auth, Realtime, and Presence.

## Current flow

1. Create an account and chat in the web application.
2. Add a Claude Code binding with a local project path.
3. Start the local connector using the same account.
4. A teammate mentions the person in chat.
5. The connector invokes Claude Code with recent chat and project context.
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

Configure each package from its `.env.example` file. Claude Code must be
installed and authenticated on the machine running the connector.

The live Supabase project currently owns the database schema and policies; this
repository does not maintain local migration files.

## Regression tests

See `docs/regression-tests.md` for the fast connector suite, staging browser
suite, required test accounts, and the complete pre-production gate.
