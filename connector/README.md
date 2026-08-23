# groupwork connector

Bridges your local Claude Code or Codex CLI agent to a dæmon group chat. Run this on your
development machine, pointed at your project directory.

## Prerequisites

1. A groupwork account (signed up via the web app)
2. At least one supported agent installed and authenticated:
   - Claude Code: `npm install -g @anthropic-ai/claude-code`
   - Codex CLI: `npm install -g @openai/codex`
3. Node.js 20+

## Setup

Install the private-beta package supplied by groupwork, then authorize your
computer in the browser. The connector does not ask for or store your password.

```bash
npm install -g ./groupwork-connector.tgz
groupwork-connect login --app-url https://your-groupwork-site.example
groupwork-connect doctor
```

## Running

```bash
groupwork-connect start
```

The project directory and agent type come from the binding configured in the
groupwork chat. The selected agent runs from that directory in read-only mode.

## What it does

1. Restores the browser-authorized groupwork session stored on this computer
2. Fetches your agent bindings across all chats
3. Opens two realtime subscriptions:
   - Observes all messages in the chat (for context)
   - Watches for `message_mention` rows where you are mentioned
4. When you are @mentioned in chat, invokes the selected agent locally against your
   project directory and routes the response based on judgment mode

## Modes

**Advice (default):** responses go to your private thread only — you see
a draft and can send-as-is, edit, or cancel. Nothing appears in the group
chat without your explicit approval.

**Act:** responses post directly to the group chat on your behalf, tagged
"(agent)". Use this when you're off the clock and trust the agent to answer
routine questions without review. Switch back to suggested when actively working.

**Judgment:** groupwork chooses Advice or Act per topic using the trust earned
from your previous draft decisions.

## Stopping

Ctrl+C stops the connector. Missed mentions are processed through Advice on the
next startup so stale responses are never posted automatically.
