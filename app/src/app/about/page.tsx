import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "../site-header";
import LogoutButton from "../chats/logout-button";

export const metadata: Metadata = {
  title: "About groupwork",
  description: "Bring the coding agent already working on your project into the conversations where your team makes decisions.",
};

const publicationModes = [
  {
    name: "Advice",
    detail: "The agent works, but its response stays in your private Agent Workspace until you review it.",
  },
  {
    name: "Act",
    detail: "The agent works and publishes its completed response directly into the conversation.",
  },
  {
    name: "Judgment",
    detail: "groupwork chooses Advice or Act for each topic using trust earned from your real review history.",
  },
];

export default async function AboutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const primaryHref = user ? "/chats" : "/auth";
  const primaryLabel = user ? "Open chats" : "Create an account";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <SiteHeader homeHref={user ? "/chats" : "/chats"}>
        {user ? (
          <>
            <Link href="/chats" className="transition-colors hover:text-neutral-300">chats</Link>
            <Link href="/connector" className="transition-colors hover:text-neutral-300">connector setup</Link>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/auth" className="transition-colors hover:text-neutral-300">log in</Link>
            <Link href="/auth" className="transition-colors hover:text-neutral-300">sign up</Link>
          </>
        )}
      </SiteHeader>

      <div className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
        <section className="mt-8 max-w-3xl space-y-7 sm:mt-12">
          <p className="text-sm text-neutral-500">About us</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Bring your agent into the conversation.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-neutral-400">
            groupwork is a shared space where developers, teammates and the agents already working on their projects can collaborate together.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={primaryHref} className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white">
              {primaryLabel}
            </Link>
            <a href="#how-it-works" className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500">
              See how it works
            </a>
          </div>
        </section>

        <section className="mt-24 grid gap-8 border-t border-neutral-800 pt-12 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">The problem</p>
            <h2 className="mt-3 text-2xl font-semibold">Our agents work with us, but not with our teams.</h2>
          </div>
          <div className="space-y-4 leading-7 text-neutral-400">
            <p>Before AI moved into the editor, developers copied code into a separate chat and pasted the answer back. Products like Cursor closed that gap by putting the agent beside the developer and their code.</p>
            <p>Team collaboration still has the same problem. Your agent works inside your IDE or terminal, while your team talks somewhere else. You relay every question and answer by hand, important context gets lost, and teammates cannot work directly with the agent that understands your project.</p>
          </div>
        </section>

        <section className="mt-24 grid gap-8 border-t border-neutral-800 pt-12 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Our solution</p>
            <h2 className="mt-3 text-2xl font-semibold">One conversation across agent workspaces.</h2>
          </div>
          <div className="space-y-4 leading-7 text-neutral-400">
            <p>groupwork brings project agents into the same shared conversation as the people doing the work. Each agent stays connected to its own project, workspace and platform while contributing to one team discussion.</p>
            <p>Teams can collaborate across Claude Code, Codex and future agent platforms without copying answers between terminals and chat. The human remains connected to the agent they bring, and everyone works from the same conversation.</p>
          </div>
        </section>

        <section id="how-it-works" className="mt-24 scroll-mt-24">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">How it works</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold">Two controls answer two different questions.</h2>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
              <span className="text-xs text-neutral-600">1 · Before execution</span>
              <h3 className="mt-2 text-xl font-semibold">Approve or Reject</h3>
              <p className="mt-3 leading-7 text-neutral-400">
                In a Team chat, a teammate can request your agent by mentioning you. The request does not reach your computer until you approve it. Reject means the local agent never runs.
              </p>
              <p className="mt-4 text-sm text-neutral-500">Solo does not need this gate because you explicitly invoke your own agent.</p>
            </article>

            <article className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
              <span className="text-xs text-neutral-600">2 · After execution</span>
              <h3 className="mt-2 text-xl font-semibold">Advice, Act or Judgment</h3>
              <p className="mt-3 leading-7 text-neutral-400">
                Once an agent is allowed to work, its response still needs a destination. You decide whether it waits privately for review, enters the chat directly, or follows trust learned by groupwork.
              </p>
            </article>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold">Response modes</h2>
          <div className="mt-6 divide-y divide-neutral-800 border-y border-neutral-800">
            {publicationModes.map((mode) => (
              <div key={mode.name} className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
                <h3 className="font-semibold">{mode.name}</h3>
                <p className="leading-7 text-neutral-400">{mode.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-24 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-neutral-800 p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Solo</p>
            <h2 className="mt-3 text-2xl font-semibold">Coordinate your own agents.</h2>
            <p className="mt-4 leading-7 text-neutral-400">
              Bring multiple named Claude and Codex agents, each attached to its own project and ongoing session. Mention exactly the agent you want and coordinate the work from one conversation.
            </p>
          </article>
          <article className="rounded-xl border border-neutral-800 p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Team</p>
            <h2 className="mt-3 text-2xl font-semibold">Bring your project agent to the team.</h2>
            <p className="mt-4 leading-7 text-neutral-400">
              Each person remains responsible for their own local agent. Teammates can request help, owners control execution, and groupwork controls how reviewed or trusted responses enter the discussion.
            </p>
          </article>
        </section>

        <section className="mt-24 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Product demo</p>
          <h2 className="mt-3 text-2xl font-semibold">Solo and Team walkthrough coming soon.</h2>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-neutral-500">
            This space will show connector setup, Solo coordination, Team approval, and how Advice, Act and Judgment change the flow.
          </p>
        </section>

        <section className="mt-24 border-t border-neutral-800 py-16 text-center">
          <h2 className="text-3xl font-semibold">Let your team work with the agent already doing the work.</h2>
          <Link href={primaryHref} className="mt-6 inline-block rounded bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white">
            {user ? "Open chats" : "Try groupwork"}
          </Link>
        </section>
      </div>
    </main>
  );
}
