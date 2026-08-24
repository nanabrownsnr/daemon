# Platform chat summaries

groupwork owns shared chat summaries. Connectors only read the completed row
from `chat_context_summary`; Claude Code and Codex CLI never generate it.

## 1. Database

Run `docs/sql/chat-context-summary.sql` in the Supabase SQL editor.

## 2. Edge Function secrets

In Supabase Dashboard, open **Edge Functions → Secrets** and add:

- `OPENROUTER_API_KEY`: the platform OpenRouter API key.
- `OPENROUTER_SUMMARY_MODEL`: currently `z-ai/glm-5.2:free` for private UAT.
  Free-provider availability and ZDR routing are not guaranteed; choose a fixed
  paid ZDR-compatible model before production.
- `SUMMARY_WEBHOOK_SECRET`: a long random value, such as the output of
  `openssl rand -hex 32`.
- `GROUPWORK_APP_URL`: the deployed groupwork URL used for OpenRouter request
  attribution.

These are platform secrets. Never prefix them with `NEXT_PUBLIC_`, place them
in `connector/.env`, or commit them to Git.

CLI alternative after linking the project:

```bash
supabase secrets set OPENROUTER_API_KEY=replace_me
supabase secrets set OPENROUTER_SUMMARY_MODEL=z-ai/glm-5.2:free
supabase secrets set SUMMARY_WEBHOOK_SECRET=replace_with_random_value
supabase secrets set GROUPWORK_APP_URL=https://groupwork-ai.vercel.app
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

OpenRouter free-provider failures are retried three times, respecting the
provider's `Retry-After` delay (capped at 15 seconds). Zero Data Retention
remains mandatory; the function will not silently route private chat context
through a provider that retains prompts.

## 5. Verify

After a chat crosses 20 messages, check:

```sql
select chat_id, summary_version, status, model_used,
       prompt_tokens, completion_tokens, through_created_at, last_error
from public.chat_context_summary
order by updated_at desc;
```

If `status` is `failed`, inspect `last_error`. It records the OpenRouter HTTP
status, error code, message, and provider metadata. A later message retries the
same unprocessed batch. After changing the function, redeploy it with:

```bash
supabase functions deploy summarize-chat
```
