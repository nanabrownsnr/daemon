import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

const requiredNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "REGRESSION_USER_A_EMAIL",
  "REGRESSION_USER_A_PASSWORD",
  "REGRESSION_USER_A_NAME",
  "REGRESSION_USER_B_EMAIL",
  "REGRESSION_USER_B_PASSWORD",
  "REGRESSION_USER_B_NAME",
  "REGRESSION_AGENT_PROJECT_PATH",
] as const;

type RequiredEnvName = (typeof requiredNames)[number];

const env = requiredNames.reduce<Record<RequiredEnvName, string>>((values, name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Use dedicated staging regression accounts.`);
  values[name] = value;
  return values;
}, {} as Record<RequiredEnvName, string>);
let ownerDb: SupabaseClient;
let memberDb: SupabaseClient;
let ownerPersonId: string;
let memberPersonId: string;
let chatId: string;
let bindingId: string;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const chatName = `regression-${runId}`;

async function authenticatedClient(email: string, password: string) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

async function lookupAuthenticatedPerson(client: SupabaseClient, authUserId: string) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await client
      .from("person")
      .select("id, display_name")
      .eq("auth_user_id", authUserId)
      .single();

    if (!result.error || result.error.code !== "PGRST303" || !result.error.message.includes("JWT issued at future")) {
      return result;
    }

    // Supabase Auth and PostgREST can briefly disagree on wall-clock time for
    // a newly issued token. The same JWT becomes valid once that skew passes.
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }

  return client
    .from("person")
    .select("id, display_name")
    .eq("auth_user_id", authUserId)
    .single();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/chats");

  if (new URL(page.url()).pathname === "/auth") {
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).last().click();
  }

  await expect(page).toHaveURL(/\/chats$/, { timeout: 15_000 });
}

test.beforeAll(async () => {
  ownerDb = await authenticatedClient(env.REGRESSION_USER_A_EMAIL, env.REGRESSION_USER_A_PASSWORD);
  memberDb = await authenticatedClient(env.REGRESSION_USER_B_EMAIL, env.REGRESSION_USER_B_PASSWORD);
  const [{ data: ownerAuth }, { data: memberAuth }] = await Promise.all([
    ownerDb.auth.getUser(),
    memberDb.auth.getUser(),
  ]);
  expect(ownerAuth.user, "User A authentication did not return a user").toBeTruthy();
  expect(memberAuth.user, "User B authentication did not return a user").toBeTruthy();

  const [{ data: owner, error: ownerError }, { data: member, error: memberError }] = await Promise.all([
    lookupAuthenticatedPerson(ownerDb, ownerAuth.user!.id),
    lookupAuthenticatedPerson(memberDb, memberAuth.user!.id),
  ]);
  expect(ownerError, `User A person lookup failed: ${ownerError?.message}`).toBeNull();
  expect(memberError, `User B person lookup failed: ${memberError?.message}`).toBeNull();
  expect(owner, "User A has no person row; verify the auth-to-person trigger").toBeTruthy();
  expect(member, "User B has no person row; verify the auth-to-person trigger").toBeTruthy();
  expect(owner!.display_name, "REGRESSION_USER_A_NAME does not match the database").toBe(env.REGRESSION_USER_A_NAME);
  expect(member!.display_name, "REGRESSION_USER_B_NAME does not match the database").toBe(env.REGRESSION_USER_B_NAME);
  ownerPersonId = owner!.id;
  memberPersonId = member!.id;
});

test.afterAll(async () => {
  if (chatId) await ownerDb.from("chat").delete().eq("id", chatId);
  await Promise.all([ownerDb?.auth.signOut(), memberDb?.auth.signOut()]);
});

test("auth, person sync, chat creation, and listing", async ({ page }) => {
  await login(page, env.REGRESSION_USER_A_EMAIL, env.REGRESSION_USER_A_PASSWORD);
  await expect(page.getByRole("heading", {
    name: `groupwork — ${env.REGRESSION_USER_A_NAME}`,
    exact: true,
  })).toBeVisible();
  await page.getByPlaceholder("New chat name").fill(chatName);
  await page.getByRole("button", { name: "Create" }).click();
  const card = page.getByRole("link", { name: chatName });
  await expect(card).toBeVisible();
  await card.click();
  chatId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(chatId).toBeTruthy();
});

test("invite by email and chat membership", async ({ page }) => {
  await login(page, env.REGRESSION_USER_A_EMAIL, env.REGRESSION_USER_A_PASSWORD);
  await page.goto(`/chats/${chatId}`);
  await page.getByRole("button", { name: "+ Add member" }).click();
  await page.getByPlaceholder("person@example.com").fill(env.REGRESSION_USER_B_EMAIL);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`Added ${env.REGRESSION_USER_B_NAME}.`)).toBeVisible();
  const { data } = await ownerDb.from("chat_member").select("person_id").eq("chat_id", chatId);
  expect(data?.map((row) => row.person_id)).toContain(memberPersonId);
});

test("Claude-only binding and three-way mode control", async ({ page }) => {
  await login(page, env.REGRESSION_USER_A_EMAIL, env.REGRESSION_USER_A_PASSWORD);
  await page.goto(`/chats/${chatId}`);
  await page.getByRole("button", { name: "+ add", exact: true }).click();
  await expect(page.getByText("Claude Code", { exact: true })).toBeVisible();
  await expect(page.getByText("Codex", { exact: true })).toHaveCount(0);
  await page.getByPlaceholder("e.g. Backend agent").fill(`Regression agent ${runId}`);
  await page.getByPlaceholder("/home/you/code/my-project").fill(env.REGRESSION_AGENT_PROJECT_PATH);
  await page.getByRole("button", { name: "Add agent" }).click();
  await expect(page.getByText(`Regression agent ${runId}`)).toBeVisible();
  const { data: binding } = await ownerDb.from("agent_binding").select("id, agent_type").eq("chat_id", chatId).eq("person_id", ownerPersonId).single();
  expect(binding?.agent_type).toBe("claude_code");
  bindingId = binding!.id;
  await page.getByRole("button", { name: "Judgment" }).click();
  await expect.poll(async () => (await ownerDb.from("agent_binding").select("mode").eq("id", bindingId).single()).data?.mode).toBe("judgment");
});

test("realtime human messaging and structured mentions", async ({ browser }) => {
  test.setTimeout(180_000);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  await login(ownerPage, env.REGRESSION_USER_A_EMAIL, env.REGRESSION_USER_A_PASSWORD);
  await login(memberPage, env.REGRESSION_USER_B_EMAIL, env.REGRESSION_USER_B_PASSWORD);
  await ownerPage.goto(`/chats/${chatId}`);
  await memberPage.goto(`/chats/${chatId}`);
  const body = `realtime-${runId}`;
  await ownerPage.getByPlaceholder("Message... (@ to mention)").fill(body);
  await ownerPage.getByRole("button", { name: "Send" }).click();
  await expect(memberPage.getByText(body)).toBeVisible();

  const mentionBody = `@${env.REGRESSION_USER_A_NAME} api-${runId}`;
  const input = memberPage.getByPlaceholder("Message... (@ to mention)");
  await input.fill(`@${env.REGRESSION_USER_A_NAME}`);
  await memberPage.getByRole("button", { name: env.REGRESSION_USER_A_NAME, exact: true }).click();
  await input.fill(mentionBody);
  await memberPage.getByRole("button", { name: "Send" }).click();
  await expect(ownerPage.getByText(mentionBody)).toBeVisible();
  const { data: message } = await memberDb.from("message").select("id").eq("chat_id", chatId).eq("body", mentionBody).single();
  const { data: mentions } = await memberDb.from("message_mention").select("person_id").eq("message_id", message!.id);
  expect(mentions).toEqual(expect.arrayContaining([{ person_id: ownerPersonId }]));

  // User A is the only regression user with an agent binding. Their locally
  // running connector should process B's mention and create an Advice draft
  // because this freshly generated topic has not earned Act trust.
  await expect.poll(async () => {
    const { data } = await ownerDb
      .from("private_thread_message")
      .select("id")
      .eq("chat_id", chatId)
      .eq("person_id", ownerPersonId)
      .eq("trigger_message_id", message!.id)
      .is("resolved_at", null)
      .maybeSingle();
    return data?.id ?? null;
  }, {
    message: "waiting for User A's local connector to produce an agent draft",
    timeout: 120_000,
  }).not.toBeNull();
  await Promise.all([ownerContext.close(), memberContext.close()]);
});

test("private drafts, judgment events, RLS, rule engine, and presence", async ({ page }) => {
  const topic = `regression-${runId}`;
  const { data: draft, error } = await ownerDb.from("private_thread_message").insert({
    chat_id: chatId, person_id: ownerPersonId, sender_type: "agent", body: `draft-${runId}`,
    topic_tag: topic, question_type: "technical",
  }).select().single();
  expect(error).toBeNull();
  const { data: hidden } = await memberDb.from("private_thread_message").select("id").eq("id", draft!.id);
  expect(hidden).toEqual([]);

  await login(page, env.REGRESSION_USER_A_EMAIL, env.REGRESSION_USER_A_PASSWORD);
  await page.goto(`/chats/${chatId}`);
  await expect(page.getByText(`draft-${runId}`)).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).last().click();
  await expect.poll(async () => (await ownerDb.from("judgment_event").select("signal").eq("private_thread_message_id", draft!.id).single()).data?.signal).toBe("sent_unedited");

  await ownerDb.from("judgment_event").insert([1, 2].map(() => ({
    person_id: ownerPersonId, agent_binding_id: bindingId, signal: "sent_unedited", topic_tag: topic,
  })));
  const { data: decision, error: decisionError } = await ownerDb.rpc("decide_topic_mode", {
    p_person_id: ownerPersonId, p_binding_id: bindingId, p_topic_tag: topic,
  });
  expect(decisionError).toBeNull();
  expect(decision).toBe("act");

  const presence = ownerDb.channel(`presence:${bindingId}`);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Presence subscription timed out")), 10_000);
    presence.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presence.track({ regression: true });
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  await expect(page.locator('[title="Connector online"]')).toBeVisible({ timeout: 10_000 });
  await ownerDb.removeChannel(presence);
});
