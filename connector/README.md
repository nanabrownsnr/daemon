# groupwork connector

Bridges your local Claude Code or Codex CLI agent to a groupwork chat. Run this on your
development machine, pointed at your project directory.

## Prerequisites

1. A groupwork account (signed up via the web app)
2. At least one supported agent installed and authenticated:
   - Claude Code CLI on Windows PowerShell: `irm https://claude.ai/install.ps1 | iex` (provides the `claude` command)
   - Claude Code CLI on macOS, Linux, or WSL: `curl -fsSL https://claude.ai/install.sh | bash` (provides the `claude` command)
   - Codex CLI on Windows PowerShell: `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"` (provides the `codex` command)
   - Codex CLI on Linux / WSL: `curl -fsSL https://chatgpt.com | bash` (provides the `codex` command)
3. Node.js 22+

These are terminal CLIs, not the Claude or ChatGPT web/desktop apps. Codex's
official installer is platform-specific; the npm package is not the reliable
installation path for this setup. On Windows, install and run Codex and the
connector from the same PowerShell or WSL environment. Claude Code is supported
through WSL or Git Bash. Claude Code's native installer is the primary setup
path here; the npm package remains an alternative. Run `groupwork-connect doctor`
after installation to verify that the executable is visible.

## Setup

Install the connector from npm, then authorize your computer in the browser.
The connector does not ask for or store your password. The same install command
works in PowerShell, macOS Terminal, and Linux shells.

```bash
npm install -g @groupwork/connect
groupwork-connect login --app-url https://groupwork-ai.vercel.app
groupwork-connect doctor
```

`doctor` also verifies that the platform topic catalog is installed. If it
reports `Topic catalog unavailable`, the groupwork operator must apply
`docs/sql/topic-classification.sql` before UAT.

If npm reports a permissions error, use a user-owned Node.js installation such
as nvm and rerun the install without `sudo`.

## Running

```bash
groupwork-connect start
```

On startup, the connector prepares a local semantic topic model in the
background. Transformers.js and its cross-platform runtimes add approximately
407 MB to a clean Linux npm installation; the first model download adds about
23 MB under `~/.groupwork/models`. Actual installed size varies by npm and OS.
Agent delivery never waits for this download: messages
use the deterministic topic fallback until the pinned model and current
platform topic-catalog version are ready. Chat text remains on the connector
computer during classification; only the selected topic and audit metadata are
written back to groupwork.

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
6. Publishes live presence state: green when online and grey when offline;
   working activity appears as a three-dot bubble in the conversation
7. Includes the chat's linked GitHub repository in the prompt when one is
   configured; the local CLI's credentials still determine repository access.
7. Shows a conversation typing indicator while an agent is working, then
   publishes one complete response to chat or Agent Workspace.

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
