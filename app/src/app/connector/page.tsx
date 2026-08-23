import Link from "next/link";
import LoginCommand from "./login-command";
import CompleteConnectorOnboarding from "./complete-connector-onboarding";

const commandClass = "mt-2 overflow-x-auto rounded border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-300";

export default function ConnectorSetupPage() {
  return (
    <main className="h-screen overflow-y-auto bg-neutral-950 px-6 py-12 text-neutral-100 chat-scroll">
      <CompleteConnectorOnboarding />
      <div className="mx-auto max-w-xl space-y-8">
        <header className="space-y-2">
          <p className="text-sm text-neutral-500">groupwork</p>
          <h1 className="text-2xl font-semibold">connect your agent</h1>
          <p className="text-sm leading-6 text-neutral-400">
            The connector runs on your computer and lets Claude Code or Codex CLI respond when you are mentioned in a groupwork chat.
          </p>
        </header>

        <ol className="space-y-6 text-sm">
          <li>
            <p className="font-medium">1. Install Node.js 20 or newer</p>
            <p className="mt-1 text-neutral-500">Check your version before continuing.</p>
            <pre className={commandClass}>node --version</pre>
          </li>
          <li>
            <p className="font-medium">2. Install and authenticate your agent</p>
            <pre className={commandClass}>npm install -g @anthropic-ai/claude-code</pre>
            <pre className={commandClass}>npm install -g @openai/codex</pre>
            <p className="mt-2 text-neutral-500">You only need the agent you plan to use.</p>
          </li>
          <li>
            <p className="font-medium">3. Download and install the private-beta connector</p>
            <p className="mt-1 text-neutral-500">First, download the connector package to your computer.</p>
            <a
              href="/downloads/groupwork-connector-0.1.0.tgz"
              download
              className="mt-2 inline-block text-neutral-300 underline underline-offset-4 hover:text-white"
            >
              Download connector 0.1.0
            </a>
            <p className="mt-3 text-neutral-500">Then open a terminal in the folder where you downloaded it and run:</p>
            <pre className={commandClass}>npm install -g ./groupwork-connector-0.1.0.tgz</pre>
            <p className="mt-2 text-neutral-500">
              For example, if it is in your Downloads folder: <code className="text-neutral-300">cd ~/Downloads</code>
            </p>
          </li>
          <li>
            <p className="font-medium">4. Authorize this computer</p>
            <LoginCommand className={commandClass} />
            <p className="mt-2 text-neutral-500">Your browser opens for approval. The connector never stores your groupwork password.</p>
          </li>
          <li>
            <p className="font-medium">5. Check the setup and start</p>
            <pre className={commandClass}>groupwork-connect doctor{"\n"}groupwork-connect start</pre>
            <p className="mt-2 text-neutral-500">Keep this terminal open during the private beta. Your agent’s presence dot should turn green.</p>
          </li>
        </ol>

        <footer className="border-t border-neutral-800 pt-6 text-sm text-neutral-500">
          Add your agent and its local project path inside the chat before running doctor. <Link href="/chats" className="text-neutral-300 hover:text-white">Return to chats</Link>.
        </footer>
      </div>
    </main>
  );
}
