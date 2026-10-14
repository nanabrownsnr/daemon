import Link from "next/link";
import LoginCommand from "./login-command";
import CompleteConnectorOnboarding from "./complete-connector-onboarding";
import CopyCommand from "./copy-command";
import AgentCliInstall from "./agent-cli-install";
import SiteHeader from "../site-header";

export default function ConnectorSetupPage() {
  return (
    <main className="h-screen overflow-y-auto bg-neutral-950 text-neutral-100 chat-scroll">
      <CompleteConnectorOnboarding />
      <SiteHeader homeHref="/chats">
        <Link href="/about" className="transition-colors hover:text-neutral-300">about</Link>
        <Link href="/chats" className="transition-colors hover:text-neutral-300">chats</Link>
      </SiteHeader>
      <div className="mx-auto max-w-xl space-y-8 px-6 pb-12">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">connect your agent</h1>
          <p className="text-sm leading-6 text-neutral-400">
            The connector runs on your computer and lets a local Claude Code CLI or Codex CLI respond when you are mentioned in a groupwork chat.
          </p>
        </header>

        <ol className="space-y-6 text-sm">
          <li>
            <p className="font-medium">1. Install Node.js 22 or newer</p>
            <p className="mt-1 text-neutral-500">Check your version before continuing.</p>
            <CopyCommand command="node --version" />
          </li>
          <li>
            <p className="font-medium">2. Install and authenticate an agent CLI</p>
            <AgentCliInstall />
          </li>
          <li>
            <p className="font-medium">3. Download and install the connector</p>
            <p className="mt-1 text-neutral-500">Download the current cross-platform connector package:</p>
            <a
              href="/downloads/groupwork-connect-0.7.3.tgz"
              download
              className="mt-2 inline-block text-neutral-300 underline underline-offset-4 hover:text-white"
            >
              Download connector 0.7.3
            </a>
            <p className="mt-3 text-neutral-500">Open a terminal in your Downloads folder, then install the downloaded package:</p>
            <div className="mt-2 space-y-2">
              <div>
                <p className="mb-1 text-xs text-neutral-600">PowerShell</p>
                <CopyCommand command="cd $HOME\\Downloads" />
              </div>
              <div>
                <p className="mb-1 text-xs text-neutral-600">macOS or Linux</p>
                <CopyCommand command="cd ~/Downloads" />
              </div>
            </div>
            <CopyCommand command="npm install -g ./groupwork-connect-0.7.3.tgz" />
            <div className="mt-3 space-y-2 rounded border border-neutral-800 p-3 text-neutral-500">
              <p>If npm reports a permissions error, use a user-owned Node.js installation such as nvm. Run the command again without <code className="text-neutral-300">sudo</code> when npm already has global install permissions.</p>
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
