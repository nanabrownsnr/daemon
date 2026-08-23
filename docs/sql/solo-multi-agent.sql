-- Human-directed Solo multi-agent chats.
-- Run once in the Supabase SQL editor before using Solo chats.

-- A draft must retain the exact agent binding that produced it so each Solo
-- agent has a separate workspace and Judgment history.
alter table public.private_thread_message
  add column if not exists agent_binding_id uuid
  references public.agent_binding(id) on delete set null;

create index if not exists private_thread_message_agent_binding_idx
  on public.private_thread_message(agent_binding_id, created_at);

-- Explicit agent targeting. Plain @text is display only; this row is what
-- causes the connector to invoke one exact binding.
create table if not exists public.message_agent_mention (
  message_id uuid not null references public.message(id) on delete cascade,
  agent_binding_id uuid not null references public.agent_binding(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, agent_binding_id)
);

create index if not exists message_agent_mention_binding_created_idx
  on public.message_agent_mention(agent_binding_id, created_at);

alter table public.message_agent_mention enable row level security;
revoke all on public.message_agent_mention from anon;
grant select, insert on public.message_agent_mention to authenticated;

-- Keep policy checks out of nested table RLS evaluation. These functions
-- expose only a boolean and still bind every decision to auth.uid().
create or replace function public.can_read_agent_mention(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.message m
    join public.chat_member cm on cm.chat_id = m.chat_id
    join public.person p on p.id = cm.person_id
    where m.id = p_message_id
      and p.auth_user_id = auth.uid()
  );
$$;

create or replace function public.can_create_agent_mention(
  p_message_id uuid,
  p_agent_binding_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.message m
    join public.person sender on sender.id = m.sender_person_id
    join public.agent_binding ab
      on ab.id = p_agent_binding_id
      and ab.chat_id = m.chat_id
      and ab.person_id = sender.id
    join public.chat c on c.id = m.chat_id
    where m.id = p_message_id
      and sender.auth_user_id = auth.uid()
      and c.is_group = false
  );
$$;

revoke all on function public.can_read_agent_mention(uuid) from public;
revoke all on function public.can_create_agent_mention(uuid, uuid) from public;
grant execute on function public.can_read_agent_mention(uuid) to authenticated;
grant execute on function public.can_create_agent_mention(uuid, uuid) to authenticated;

drop policy if exists "chat members can read agent mentions" on public.message_agent_mention;
create policy "chat members can read agent mentions"
on public.message_agent_mention for select to authenticated
using (public.can_read_agent_mention(message_id));

drop policy if exists "chat members can create agent mentions" on public.message_agent_mention;
create policy "chat members can create agent mentions"
on public.message_agent_mention for insert to authenticated
with check (public.can_create_agent_mention(message_id, agent_binding_id));

-- Remove only a two-column UNIQUE constraint/index on (chat_id, person_id)
-- or (person_id, chat_id). Team uniqueness is replaced by the trigger below;
-- Solo chats may then contain multiple bindings for their one owner.
do $$
declare
  v_constraint record;
  v_index record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.agent_binding'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by a.attname)
        from unnest(c.conkey) key(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
      ) = array['chat_id', 'person_id']::name[]
  loop
    execute format('alter table public.agent_binding drop constraint %I', v_constraint.conname);
  end loop;

  for v_index in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'agent_binding'
      and indexdef ilike 'create unique index%'
      and indexdef ~* '\\(chat_id, person_id\\)|\\(person_id, chat_id\\)'
  loop
    execute format('drop index if exists public.%I', v_index.indexname);
  end loop;
end;
$$;

create or replace function public.enforce_team_single_agent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.chat where id = new.chat_id and is_group = true) then
    perform pg_advisory_xact_lock(hashtextextended(new.chat_id::text || new.person_id::text, 0));
    if exists (
      select 1 from public.agent_binding
      where chat_id = new.chat_id
        and person_id = new.person_id
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      raise exception 'Team chats allow one agent per person' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_team_single_agent_trigger on public.agent_binding;
create trigger enforce_team_single_agent_trigger
before insert or update of chat_id, person_id on public.agent_binding
for each row execute function public.enforce_team_single_agent();

-- Realtime powers connector delivery of explicit agent mentions.
do $$
begin
  alter publication supabase_realtime add table public.message_agent_mention;
exception
  when duplicate_object then null;
end;
$$;
