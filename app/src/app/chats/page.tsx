import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateChatForm from "./create-chat-form";
import LogoutButton from "./logout-button";
import ChatCardAction from "./chat-card-action";

type Chat = {
  id: string;
  name: string | null;
  created_at: string;
  created_by: string | null;
};

export default async function ChatsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  // find this auth user's person row
  const { data: person, error: personError } = await supabase
    .from("person")
    .select("id, display_name")
    .eq("auth_user_id", user!.id)
    .single();

  if (personError || !person) {
    return (
      <div className="p-8 text-red-400 space-y-2">
        <p>No person record found for this account. Check the auth→person sync trigger.</p>
        {personError && (
          <p className="text-xs text-neutral-500">
            Query error: {personError.message}
          </p>
        )}
      </div>
    );
  }

  // chats this person is a member of
  const { data: memberships } = await supabase
    .from("chat_member")
    .select("chat_id, chat:chat_id(id, name, is_group, created_at, created_by)")
    .eq("person_id", person.id);

  const chats = (memberships ?? []).flatMap((membership) => {
    const related = Array.isArray(membership.chat) ? membership.chat[0] : membership.chat;
    return related ? [related as Chat] : [];
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-5 py-8 sm:px-8 sm:py-12">
      <div className="max-w-2xl mx-auto space-y-10">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">groupwork</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your conversations</h1>
            <p className="mt-1 text-sm text-neutral-500">Signed in as {person.display_name}</p>
          </div>
          <div className="pt-1">
            <LogoutButton />
          </div>
        </header>

        <CreateChatForm personId={person.id} />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">Chats</h2>
            <span className="text-xs text-neutral-600">{chats.length}</span>
          </div>
          {chats.length === 0 && (
            <div className="rounded-2xl border border-dashed border-neutral-800 px-6 py-12 text-center">
              <p className="text-sm font-medium text-neutral-300">No conversations yet</p>
              <p className="mt-1 text-sm text-neutral-600">Create one above and invite your team.</p>
            </div>
          )}
          <ul className="space-y-2">
            {chats.map((chat) => (
              <li
                key={chat.id}
                className="group flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-2 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
              >
                <Link
                  href={`/chats/${chat.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-sm font-semibold text-neutral-300">
                    {(chat.name?.trim() || "C")[0].toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-100">
                      {chat.name || "Untitled chat"}
                    </span>
                    <span className="block text-xs text-neutral-600">
                      {chat.created_by === person.id ? "Created by you" : "Team conversation"}
                    </span>
                  </span>
                </Link>
                <div className="pr-3">
                  <ChatCardAction
                    chatId={chat.id}
                    isOwner={chat.created_by === person.id}
                    personId={person.id}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
