-- Shared rolling context for long chats.
-- Run once in the Supabase SQL editor and deploy the summarize-chat Edge Function.

create table if not exists public.chat_context_summary (
  chat_id uuid primary key references public.chat(id) on delete cascade,
  summary text not null default '',
  through_created_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by_person_id uuid references public.person(id) on delete set null,
  summary_version int not null default 0,
  status text not null default 'idle'
    check (status in ('idle', 'processing', 'failed')),
  processing_started_at timestamptz,
  model_used text,
  prompt_tokens int,
  completion_tokens int,
  last_error text
);

-- Safe if the first version of this runbook was already applied.
alter table public.chat_context_summary alter column through_created_at drop not null;
alter table public.chat_context_summary add column if not exists summary_version int not null default 0;
alter table public.chat_context_summary add column if not exists status text not null default 'idle';
alter table public.chat_context_summary add column if not exists processing_started_at timestamptz;
alter table public.chat_context_summary add column if not exists model_used text;
alter table public.chat_context_summary add column if not exists prompt_tokens int;
alter table public.chat_context_summary add column if not exists completion_tokens int;
alter table public.chat_context_summary add column if not exists last_error text;

do $$
begin
  alter table public.chat_context_summary
    add constraint chat_context_summary_status_check
    check (status in ('idle', 'processing', 'failed'));
exception
  when duplicate_object then null;
end;
$$;

alter table public.chat_context_summary enable row level security;
revoke all on public.chat_context_summary from anon, authenticated;
grant select on public.chat_context_summary to authenticated;

drop policy if exists "chat members can read context summary" on public.chat_context_summary;
create policy "chat members can read context summary"
on public.chat_context_summary for select to authenticated
using (
  exists (
    select 1
    from public.chat_member member
    join public.person person on person.id = member.person_id
    where member.chat_id = chat_context_summary.chat_id
      and person.auth_user_id = auth.uid()
  )
);

-- Remove the connector-era writer if an earlier version of this runbook ran.
drop function if exists public.store_chat_context_summary(uuid, text, timestamptz);

-- Atomically claim one incremental block. The first summary waits until at
-- least two distinct speakers have contributed; after that, every new message
-- can refresh the running context. Database webhooks can arrive together;
-- only one Edge Function is allowed to summarize a chat at a time.
create or replace function public.claim_chat_summary_batch(
  p_chat_id uuid,
  p_batch_size int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.chat_context_summary%rowtype;
  v_messages jsonb;
  v_count int;
  v_distinct_senders int;
begin
  if p_batch_size < 5 or p_batch_size > 100 then
    raise exception 'Invalid summary batch size' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chat-summary:' || p_chat_id::text, 0));

  select * into v_existing
  from public.chat_context_summary
  where chat_id = p_chat_id
  for update;

  if found
     and v_existing.status = 'processing'
     and v_existing.processing_started_at > now() - interval '5 minutes' then
    return null;
  end if;

  with pending as (
    select
      message.id,
      message.body,
      message.sender_person_id,
      message.sender_type::text as sender_type,
      message.created_at,
      person.display_name as sender_name,
      binding.agent_label
    from public.message message
    join public.person person on person.id = message.sender_person_id
    left join public.agent_binding binding on binding.id = message.agent_binding_id
    where message.chat_id = p_chat_id
      and (v_existing.through_created_at is null or message.created_at > v_existing.through_created_at)
  ), batch as (
    select * from pending order by created_at asc limit p_batch_size
  )
  select
    (select count(*) from pending),
    (select count(distinct sender_person_id) from pending),
    (select jsonb_agg(to_jsonb(batch) - 'sender_person_id' order by batch.created_at) from batch)
  into v_count, v_distinct_senders, v_messages;

  if coalesce(v_count, 0) = 0 then
    return null;
  end if;

  -- Do not publish a one-person monologue as shared context. Once a summary
  -- exists, a single new message is enough to produce the next version.
  if v_existing.through_created_at is null and coalesce(v_distinct_senders, 0) < 2 then
    return null;
  end if;

  insert into public.chat_context_summary (chat_id, status, processing_started_at, last_error)
  values (p_chat_id, 'processing', now(), null)
  on conflict (chat_id) do update
  set status = 'processing', processing_started_at = now(), last_error = null;

  return jsonb_build_object(
    'chat_id', p_chat_id,
    'previous_summary', coalesce(v_existing.summary, ''),
    'summary_version', coalesce(v_existing.summary_version, 0),
    'messages', v_messages,
    'through_created_at', v_messages -> (jsonb_array_length(v_messages) - 1) ->> 'created_at'
  );
end;
$$;

create or replace function public.finish_chat_summary_batch(
  p_chat_id uuid,
  p_summary text,
  p_through_created_at timestamptz,
  p_model_used text,
  p_prompt_tokens int default null,
  p_completion_tokens int default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(p_summary), '') is null then
    raise exception 'Summary cannot be empty' using errcode = '22023';
  end if;

  update public.chat_context_summary
  set summary = left(btrim(p_summary), 8000),
      through_created_at = p_through_created_at,
      updated_at = now(),
      summary_version = summary_version + 1,
      status = 'idle',
      processing_started_at = null,
      model_used = p_model_used,
      prompt_tokens = p_prompt_tokens,
      completion_tokens = p_completion_tokens,
      last_error = null
  where chat_id = p_chat_id
    and status = 'processing'
    and (through_created_at is null or through_created_at < p_through_created_at);
end;
$$;

create or replace function public.fail_chat_summary_batch(p_chat_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.chat_context_summary
  set status = 'failed',
      processing_started_at = null,
      last_error = left(coalesce(p_error, 'Unknown summary error'), 1000)
  where chat_id = p_chat_id and status = 'processing';
$$;

revoke all on function public.claim_chat_summary_batch(uuid, int) from public;
revoke all on function public.finish_chat_summary_batch(uuid, text, timestamptz, text, int, int) from public;
revoke all on function public.fail_chat_summary_batch(uuid, text) from public;
grant execute on function public.claim_chat_summary_batch(uuid, int) to service_role;
grant execute on function public.finish_chat_summary_batch(uuid, text, timestamptz, text, int, int) to service_role;
grant execute on function public.fail_chat_summary_batch(uuid, text) to service_role;

do $$
begin
  alter publication supabase_realtime add table public.chat_context_summary;
exception
  when duplicate_object then null;
end;
$$;
