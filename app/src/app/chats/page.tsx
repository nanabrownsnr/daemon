import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateChatForm from "./create-chat-form";
import LogoutButton from "./logout-button";

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
    .select("chat_id, chat:chat_id(id, name, is_group, created_at)")
    .eq("person_id", person.id);

  const chats = (memberships ?? []).map((m: any) => m.chat).filter(Boolean);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            groupwork — {person.display_name}
          </h1>
          <LogoutButton />
        </div>

        <CreateChatForm personId={person.id} />

        <div className="space-y-2">
          <h2 className="text-sm text-neutral-400 uppercase tracking-wide">
            Your chats
          </h2>
          {chats.length === 0 && (
            <p className="text-neutral-500 text-sm">No chats yet.</p>
          )}
          <ul className="space-y-1">
            {chats.map((chat: any) => (
              <li key={chat.id}>
                <a
                  href={`/chats/${chat.id}`}
                  className="block rounded bg-neutral-900 border border-neutral-800 px-4 py-3 hover:border-neutral-600"
                >
                  {chat.name || "(untitled chat)"}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}