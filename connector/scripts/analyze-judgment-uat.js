import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const chatName = process.argv.slice(2).join(" ") || "uat 2";
const url = process.env.GROUPWORK_SUPABASE_URL;
const key = process.env.GROUPWORK_SUPABASE_ANON_KEY;
const email = process.env.GROUPWORK_EMAIL;
const password = process.env.GROUPWORK_PASSWORD;

if (!url || !key || !email || !password) {
  throw new Error("Connector Supabase credentials are missing from connector/.env");
}

const supabase = createClient(url, key);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError || !auth.user) throw new Error(`Authentication failed: ${authError?.message}`);

const { data: person, error: personError } = await supabase
  .from("person")
  .select("id, display_name")
  .eq("auth_user_id", auth.user.id)
  .single();
if (personError || !person) throw new Error(`Person lookup failed: ${personError?.message}`);

const { data: chat, error: chatError } = await supabase
  .from("chat")
  .select("id, name, created_at")
  .eq("name", chatName)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (chatError || !chat) throw new Error(`Could not find a visible chat named "${chatName}": ${chatError?.message ?? "not found"}`);

const { data: binding, error: bindingError } = await supabase
  .from("agent_binding")
  .select("id, agent_label, mode")
  .eq("chat_id", chat.id)
  .eq("person_id", person.id)
  .single();
if (bindingError || !binding) throw new Error(`Binding lookup failed: ${bindingError?.message}`);

const { data: events, error: eventsError } = await supabase
  .from("judgment_event")
  .select("id, topic_tag, signal, created_at, private_thread_message_id, message_id")
  .eq("person_id", person.id)
  .eq("agent_binding_id", binding.id)
  .order("created_at", { ascending: false })
  .order("id", { ascending: false });
if (eventsError) throw new Error(`Judgment event lookup failed: ${eventsError.message}`);

const topics = [...new Set((events ?? []).map((event) => event.topic_tag ?? "general"))];
const summary = [];
for (const topic of topics) {
  const topicEvents = (events ?? []).filter((event) => (event.topic_tag ?? "general") === topic);
  let uneditedStreak = 0;
  for (const event of topicEvents) {
    if (event.signal !== "sent_unedited") break;
    uneditedStreak += 1;
  }
  const { data: decision, error } = await supabase.rpc("decide_topic_mode", {
    p_person_id: person.id,
    p_binding_id: binding.id,
    p_topic_tag: topic,
  });
  summary.push({ topic, events: topicEvents.length, latest_signal: topicEvents[0]?.signal, unedited_streak: uneditedStreak, decision: error ? `ERROR: ${error.message}` : decision });
}

console.log(`\nJudgment UAT: ${chat.name}`);
console.log(`Person: ${person.display_name}`);
console.log(`Binding: ${binding.agent_label ?? binding.id} (${binding.mode})\n`);
console.table(summary);
console.log("Recent judgment events (newest first):");
console.table(events ?? []);

await supabase.auth.signOut();
