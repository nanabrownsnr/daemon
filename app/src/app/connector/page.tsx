import Link from "next/link";
import LoginCommand from "./login-command";
import CompleteConnectorOnboarding from "./complete-connector-onboarding";
import CopyCommand from "./copy-command";

export default function ConnectorSetupPage() {
  return (
    <main className="h-screen overflow-y-auto bg-neutral-950 px-6 py-12 text-neutral-100 chat-scroll">
      <CompleteConnectorOnboarding />
      <div className="mx-auto max-w-xl space-y-8">
        <header className="space-y-2">
          <Link href="/chats" className="inline-block text-sm text-neutral-500 transition-colors hover:text-neutral-300">
            groupwork
          </Link>
          <h1 className="text-2xl font-semibold">connect your agent</h1>
          <p className="text-sm leading-6 text-neutral-400">
            The connector runs on your computer and lets Claude Code or Codex CLI respond when you are mentioned in a groupwork chat.
          </p>
        </header>

        <ol className="space-y-6 text-sm">
          <li>
            <p className="font-medium">1. Install Node.js 20 or newer</p>
            <p className="mt-1 text-neutral-500">Check your version before continuing.</p>
            <CopyCommand command="node --version" />
          </li>
          <li>
            <p className="font-medium">2. Install and authenticate your agent</p>
            <CopyCommand command="npm install -g @anthropic-ai/claude-code" />
            <CopyCommand command="npm install -g @openai/codex" />
            <p className="mt-2 text-neutral-500">You only need the agent you plan to use.</p>
          </li>
          <li>
            <p className="font-medium">3. Download and install the private-beta connector</p>
            <p className="mt-1 text-neutral-500">First, download the connector package to your computer.</p>
            <a
              href="/downloads/groupwork-connector-0.6.0.tgz"
              download
              className="mt-2 inline-block text-neutral-300 underline underline-offset-4 hover:text-white"
            >
              Download connector 0.6.0
            </a>
            <p className="mt-3 text-neutral-500">Then open a terminal in the folder where you downloaded it and run:</p>
            <CopyCommand command="npm install -g ./groupwork-connector-0.6.0.tgz" />
            <p className="mt-2 text-neutral-500">
              For example, if it is in your Downloads folder: <code className="text-neutral-300">cd ~/Downloads</code>
            </p>
            <div className="mt-3 space-y-2 rounded border border-neutral-800 p-3 text-neutral-500">
              <p>If npm reports <code className="text-neutral-300">EACCES</code> for <code className="text-neutral-300">/usr/local</code>, your global npm installation is system-owned. On Linux, rerun the install with:</p>
              <CopyCommand command="sudo npm install -g ./groupwork-connector-0.6.0.tgz" />
              <p>Existing private-beta users may first need:</p>
              <CopyCommand command="sudo npm uninstall -g @daemon/connect" />
              <p className="text-xs text-neutral-600">Do not use sudo when npm already installs global packages without it. A user-owned Node installation such as nvm avoids this requirement.</p>
            </div>
            <p className="mt-3 text-xs leading-5 text-neutral-600">
              Allow roughly 450 MB of disk space for the cross-platform local inference runtime and its 23 MB model cache. First-start model preparation runs in the background; mentions continue using the safe fallback until it is ready.
            </p>
          </li>
          <li>
            <p className="font-medium">4. Authorize this computer</p>
            <LoginCommand />
            <p className="mt-2 text-neutral-500">Your browser opens for approval. The connector never stores your groupwork password.</p>
          </li>
          <li>
            <p className="font-medium">5. Check the setup and start</p>
            <CopyCommand command="groupwork-connect doctor" />
            <CopyCommand command="groupwork-connect start" />
            <p className="mt-2 text-neutral-500">Keep this terminal open during the private beta. Your agent’s presence dot should turn green.</p>
          </li>
        </ol>

        <section className="space-y-4 border-t border-neutral-800 pt-8 text-sm">
          <div>
            <h2 className="font-medium">connector commands</h2>
            <p className="mt-1 text-neutral-500">Use these after your connector is installed and authorized.</p>
          </div>
          <div>
            <p className="text-neutral-400">Start listening for mentions</p>
            <CopyCommand command="groupwork-connect start" />
          </div>
          <div>
            <p className="text-neutral-400">Pause mention processing</p>
            <CopyCommand command="groupwork-connect pause" />
          </div>
          <div>
            <p className="text-neutral-400">Resume mention processing</p>
            <CopyCommand command="groupwork-connect resume" />
          </div>
          <div>
            <p className="text-neutral-400">Check your installation and bindings</p>
            <CopyCommand command="groupwork-connect doctor" />
          </div>
          <div>
            <p className="text-neutral-400">Remove this computer&apos;s saved login</p>
            <CopyCommand command="groupwork-connect logout" />
          </div>
        </section>

        <footer className="border-t border-neutral-800 pt-6 text-sm text-neutral-500">
          Add your agent and its local project path inside the chat before running doctor. <Link href="/chats" className="text-neutral-300 hover:text-white">Return to chats</Link>.
        </footer>
      </div>
    </main>
  );
}
