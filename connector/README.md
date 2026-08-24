# groupwork connector

Bridges your local Claude Code or Codex CLI agent to a groupwork chat. Run this on your
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

If npm reports `EACCES` for `/usr/local`, the machine's global npm directory is
root-owned. On Linux, use `sudo npm install -g ./groupwork-connector.tgz` (and
`sudo npm uninstall -g @daemon/connect` when upgrading from the old private-beta
package). Do not use `sudo` when global npm installs already work without it;
a user-owned Node installation such as nvm avoids this requirement.

## Running

```bash
groupwork-connect start
```

The project directory and agent type come from the binding configured in the
groupwork chat. Solo agents receive their normal terminal-equivalent local
permissions because the owner explicitly invokes them.
Team-chat invocations are queued in Agent Workspace until the agent owner
accepts or rejects the work; acceptance grants the selected runtime its normal
local terminal permissions for that request.

## What it does

1. Restores the browser-authorized groupwork session stored on this computer
2. Fetches your agent bindings across all chats
3. Opens realtime subscriptions that:
   - Observes all messages in the chat (for context)
   - Watches owner-approved Team run requests and binding-specific Solo mentions
4. Invokes Solo mentions immediately; Team work only runs after its owner
   accepts the request
5. Reads the platform-owned shared summary while retaining each agent's recent
   raw-message delta; Supabase generates summaries independently of connectors
6. Publishes live presence state: green when online, pulsing yellow while
   working, and temporarily red after an invocation failure

## Modes

**Advice (default):** responses go to your private thread only — you see
a draft and can send-as-is, edit, or cancel. Nothing appears in the group
chat without your explicit approval.

**Act:** responses post directly to the group chat on your behalf, tagged
"(agent)". Use this when you're off the clock and trust the agent to answer
routine questions without review. Switch back to Advice when actively working.

**Judgment:** groupwork chooses Advice or Act per topic using the trust earned
from your previous draft decisions.

## Stopping

Ctrl+C stops the connector. Missed mentions are processed through Advice on the
next startup so stale responses are never posted automatically.
