import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InviteModal from "./invite-modal";
import AgentModal from "./agent-modal";
import ChatMessages from "./chat-messages";
import AgentBindings from "./agent-bindings";
import PrivateThread from "./private-thread";
import ResizableLayout from "./resizable-layout";

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
    .from("chat").select("id, name").eq("id", chatId).single();
  if (!chat) notFound();

  const { data: members } = await supabase
    .from("chat_member")
    .select("person:person_id(id, display_name)")
    .eq("chat_id", chatId);

  const { data: myBinding } = await supabase
    .from("agent_binding").select("id")
    .eq("chat_id", chatId).eq("person_id", myPerson.id).single();

  const personNames: Record<string, string> = {};
  (members ?? []).filter((m: any) => m.person)
    .forEach((m: any) => { personNames[m.person.id] = m.person.display_name; });

  const chatMembers = (members ?? []).filter((m: any) => m.person)
    .map((m: any) => ({ id: m.person.id, display_name: m.person.display_name }));

  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <a href="/chats" className="text-neutral-500 hover:text-neutral-300 text-sm">←</a>
          <span className="font-medium">{chat.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <InviteModal chatId={chatId} />
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span>{myPerson.display_name}</span>
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          </div>
        </div>
      </div>

      {/* Body */}
      <ResizableLayout
        main={
          <ChatMessages
            chatId={chatId}
            personId={myPerson.id}
            personNames={personNames}
            chatMembers={chatMembers}
          />
        }
        sidebar={
          <div className="flex-1 overflow-y-auto sidebar-scroll">
            {/* Agents */}
            <div className="p-4 border-b border-neutral-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-neutral-500 uppercase tracking-wide">Agents</p>
                <AgentModal chatId={chatId} personId={myPerson.id} />
              </div>
              <AgentBindings
                chatId={chatId}
                personId={myPerson.id}
                personNames={personNames}
              />
            </div>

            {/* Members */}
            <div className="p-4 border-b border-neutral-800">
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Members</p>
              <ul className="space-y-2">
                {chatMembers.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0" />
                    <span className="text-neutral-400 truncate">
                      {m.display_name}
                      {m.id === myPerson.id && <span className="text-neutral-600 ml-1 text-xs">you</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Agent drafts */}
            <div className="p-4">
              <PrivateThread
                chatId={chatId}
                personId={myPerson.id}
                agentBindingId={myBinding?.id ?? null}
              />
            </div>
          </div>
        }
      />
    </div>
  );
}