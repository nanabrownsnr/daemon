import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InviteModal from "./invite-modal";
import AgentModal from "./agent-modal";
import ChatMessages from "./chat-messages";
import AgentBindings from "./agent-bindings";
import PrivateThread from "./private-thread";
import ResizableLayout from "./resizable-layout";
import LogoutButton from "../logout-button";
import MembersList from "./members-list";
import CollapsibleSidebarSection from "./collapsible-sidebar-section";
import ChatSummary from "./chat-summary";
import { AgentPresenceProvider } from "./agent-presence";
import GithubProjectLink from "./github-project-link";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chatId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: myPerson, error: personError } = await supabase
    .from("person")
    .select("id, display_name")
    .eq("auth_user_id", user!.id)
    .single();

  if (personError || !myPerson) {
    return (
      <div className="p-8 text-red-400">
        <p>No person record found.</p>
        {personError && <p className="text-xs text-neutral-500 mt-1">{personError.message}</p>}
      </div>
    );
  }

  const { data: chat } = await supabase
    .from("chat").select("id, name, created_by, is_group, github_url").eq("id", chatId).single();
  if (!chat) notFound();

  const { data: members } = await supabase
    .from("chat_member")
    .select("person:person_id(id, display_name)")
    .eq("chat_id", chatId);

  const { data: chatBindings } = await supabase
    .from("agent_binding")
    .select("id, person_id, agent_type, agent_label")
    .eq("chat_id", chatId);

  const myBindings = (chatBindings ?? []).filter((binding) => binding.person_id === myPerson.id);

  const chatMembers = (members ?? []).flatMap((membership) => {
    const related = Array.isArray(membership.person) ? membership.person[0] : membership.person;
    return related ? [{ id: related.id, display_name: related.display_name }] : [];
  });
  const personNames = Object.fromEntries(
    chatMembers.map((member) => [member.id, member.display_name])
  );

  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/chats" className="text-neutral-500 hover:text-neutral-300 text-sm">←</Link>
          <span className="font-medium">{chat.name}</span>
          <GithubProjectLink chatId={chatId} initialUrl={chat.github_url ?? null} isOwner={chat.created_by === myPerson.id} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span>{myPerson.display_name}</span>
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <LogoutButton />
          </div>
        </div>
      </div>

      {/* Body */}
      <AgentPresenceProvider bindingIds={(chatBindings ?? []).map((binding) => binding.id)}>
      <ResizableLayout
        main={
          <ChatMessages
            chatId={chatId}
            personId={myPerson.id}
            personNames={personNames}
            chatMembers={chatMembers}
            isSolo={!chat.is_group}
            agentBindings={chatBindings ?? []}
          />
        }
        sidebar={
          <div className="flex-1 overflow-y-auto sidebar-scroll">
            {/* Agents */}
            <CollapsibleSidebarSection
              title="Agents"
              action={!chat.is_group || myBindings.length === 0
                ? <AgentModal chatId={chatId} personId={myPerson.id} isSolo={!chat.is_group} />
                : undefined}
            >
              <AgentBindings
                chatId={chatId}
                personId={myPerson.id}
              />
            </CollapsibleSidebarSection>

            {/* Members */}
            {chat.is_group && (
              <CollapsibleSidebarSection
                title="Members"
                action={chat.created_by === myPerson.id ? <InviteModal chatId={chatId} /> : undefined}
              >
                <MembersList
                  chatId={chatId}
                  members={chatMembers}
                  myPersonId={myPerson.id}
                  isOwner={chat.created_by === myPerson.id}
                />
              </CollapsibleSidebarSection>
            )}

            <CollapsibleSidebarSection title="Shared context">
              <ChatSummary chatId={chatId} />
            </CollapsibleSidebarSection>

            {/* Agent workspace */}
        
              <PrivateThread
                chatId={chatId}
                personId={myPerson.id}
                agentBindings={myBindings}
              />
            
          </div>
        }
      />
      </AgentPresenceProvider>
    </div>
  );
}
