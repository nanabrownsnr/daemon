# Platform chat summaries

Groupwork owns shared chat summaries. Connectors only read the completed row
from `chat_context_summary`; Claude Code and Codex CLI never generate it.

## 1. Database

Run `docs/sql/chat-context-summary.sql` in the Supabase SQL editor.

## 2. Edge Function secrets

In Supabase Dashboard, open **Edge Functions → Secrets** and add:

- `OPENROUTER_API_KEY`: the platform OpenRouter API key.
- `OPENROUTER_SUMMARY_MODEL`: use `openrouter/free` for private UAT; choose a
  fixed paid model before production.
- `SUMMARY_WEBHOOK_SECRET`: a long random value, such as the output of
  `openssl rand -hex 32`.
- `GROUPWORK_APP_URL`: the deployed Groupwork URL used for OpenRouter request
  attribution.

These are platform secrets. Never prefix them with `NEXT_PUBLIC_`, place them
in `connector/.env`, or commit them to Git.

CLI alternative after linking the project:

```bash
supabase secrets set OPENROUTER_API_KEY=replace_me
supabase secrets set OPENROUTER_SUMMARY_MODEL=openrouter/free
supabase secrets set SUMMARY_WEBHOOK_SECRET=replace_with_random_value
supabase secrets set GROUPWORK_APP_URL=https://your-groupwork-app.example
```

## 3. Deploy

```bash
supabase functions deploy summarize-chat
```

The committed `supabase/config.toml` disables the gateway JWT check for this
webhook receiver. The function still rejects requests unless the private
`x-groupwork-summary-secret` header matches `SUMMARY_WEBHOOK_SECRET`.

## 4. Database webhook

In Supabase Dashboard, open **Database → Webhooks** and create:

- Name: `summarize-chat-on-message`
- Table: `public.message`
- Event: `INSERT`
- Method: `POST`
- Destination: the `summarize-chat` Edge Function
- Header: `x-groupwork-summary-secret` with the exact
  `SUMMARY_WEBHOOK_SECRET` value

The function acknowledges immediately and runs the OpenRouter request as a
background task. PostgreSQL atomically claims a batch only when the chat has
20 unsummarized messages, so concurrent webhook deliveries cannot create
duplicate summaries.

## 5. Verify

After a chat crosses 20 messages, check:

```sql
select chat_id, summary_version, status, model_used,
       prompt_tokens, completion_tokens, through_created_at, last_error
from public.chat_context_summary
order by updated_at desc;
```
