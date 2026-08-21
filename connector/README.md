# dæmon connector

Bridges your local Claude Code or Codex CLI agent to a dæmon group chat. Run this on your
development machine, pointed at your project directory.

## Prerequisites

1. A dæmon account (signed up via the web app)
2. At least one supported agent installed and authenticated:
   - Claude Code: `npm install -g @anthropic-ai/claude-code`
   - Codex CLI: `npm install -g @openai/codex`
3. An Anthropic API key (separate from your dæmon account)
4. Node.js 18+

## Setup

```bash
cd daemon/connector
npm install
cp .env.example .env
# fill in .env with your credentials and chat ID
```

### Finding your chat ID

Open the dæmon web app, click into the chat you want to bridge.
The chat ID is in the URL: `/chats/<chat-id>`

## Running

```bash
node src/cli.js start
# or from the connector directory:
npm start
```

Run this from your project directory, or set `DAEMON_PROJECT_DIR` in `.env`
to an absolute path. The selected agent runs from that directory in read-only mode.

## What it does

1. Authenticates to dæmon using your email/password
2. Creates (or reuses) an agent binding for your account in the specified chat
3. Opens two realtime subscriptions:
   - Observes all messages in the chat (for context)
   - Watches for `message_mention` rows where you are mentioned
4. When you are @mentioned in chat, invokes the selected agent locally against your
   project directory and routes the response based on judgment mode

## Modes

**Suggested (default):** responses go to your private thread only — you see
a draft and can send-as-is, edit, or cancel. Nothing appears in the group
chat without your explicit approval.

**Auto:** responses post directly to the group chat on your behalf, tagged
"(agent)". Use this when you're off the clock and trust the agent to answer
routine questions without review. Switch back to suggested when actively working.

To temporarily test auto mode: in `src/connector.js`, change the `mode`
variable in `routeResponse()` from `"suggested"` to `"auto"`. Revert before
adding real users.

## Stopping

Ctrl+C — the connector disconnects cleanly. Mentions received while
offline are visible on next startup (not auto-processed).
