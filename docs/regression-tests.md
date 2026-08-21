# Regression test gate

The suite maps completed work-log behavior to two test layers. Once the staging
accounts below are configured, run every regression from the repository root:

```bash
npm run test:regression
```

## Fast connector tests

Run on every change:

```bash
cd connector
npm test
```

These cover topic/question classification, prompt context, Advice and Act
routing, Judgment RPC decisions and safe fallback, forced-Advice catch-up,
pause/resume persistence, prevention of self-reinforcing trust events, and the
read-only Claude Code invocation contract.

## Staging browser and Supabase regressions

Create two dedicated users in the staging Supabase project. User A is the only
user given an agent binding; User B remains human-only and mentions User A.
Start User A's connector locally before running the suite. Never point this
suite at production: it creates and deletes chats, messages, bindings, drafts,
and judgment events.

Add these values to `app/.env.local`:

```dotenv
REGRESSION_USER_A_EMAIL=
REGRESSION_USER_A_PASSWORD=
REGRESSION_USER_A_NAME=
REGRESSION_USER_B_EMAIL=
REGRESSION_USER_B_PASSWORD=
REGRESSION_USER_B_NAME=
REGRESSION_AGENT_PROJECT_PATH=/absolute/path/to/user-a-project
```

Then run:

```bash
cd app
npm run test:e2e
```

The browser suite covers authentication/person lookup, chat creation and
listing, invitations, membership, Claude-only agent registration, Advice/Act/
Judgment mode changes, realtime messaging across two browser sessions,
structured mentions, User A's real local connector/Claude draft loop, private
drafts, judgment-event recording, private-thread RLS isolation, the
`decide_topic_mode` RPC, and presence. User B does not need or receive an agent
binding.

## Before production

Run the complete production gate from the repository root:

```bash
npm run check:prod
```

All four commands must pass. The browser suite invokes User A's local Claude
connector once, so it consumes a real agent request and requires the connector
to remain running for the duration of the test.
