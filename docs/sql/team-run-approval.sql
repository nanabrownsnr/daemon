-- Owner approval gate for Team-chat agent execution.
-- Run once in the Supabase SQL editor before installing connector 0.4.0.

create table if not exists public.agent_run_request (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chat(id) on delete cascade,
  message_id uuid not null references public.message(id) on delete cascade,
  requester_person_id uuid not null references public.person(id) on delete cascade,
  owner_person_id uuid not null references public.person(id) on delete cascade,
  agent_binding_id uuid not null references public.agent_binding(id) on delete cascade,
  permission text not null default 'workspace_write'
    check (permission in ('read_only', 'workspace_write')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'running', 'completed', 'failed', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  unique (message_id, agent_binding_id)
);

alter table public.agent_run_request alter column permission set default 'workspace_write';

create index if not exists agent_run_request_owner_status_idx
  on public.agent_run_request(owner_person_id, status, created_at);

alter table public.agent_run_request enable row level security;
revoke all on public.agent_run_request from anon, authenticated;
grant select on public.agent_run_request to authenticated;

create or replace function public.can_read_agent_run_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.agent_run_request request
    join public.person person on person.id = request.owner_person_id
    where request.id = p_request_id
      and person.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.can_read_agent_run_request(uuid) from public;
grant execute on function public.can_read_agent_run_request(uuid) to authenticated;

drop policy if exists "owners can read agent run requests" on public.agent_run_request;
create policy "owners can read agent run requests"
on public.agent_run_request for select to authenticated
using (public.can_read_agent_run_request(id));

-- A Team @mention creates a pending request for that person's one binding.
-- Solo uses message_agent_mention and remains immediate.
create or replace function public.queue_team_agent_run_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message public.message%rowtype;
  v_binding_id uuid;
begin
  select * into v_message from public.message where id = new.message_id;

  if not exists (
    select 1 from public.chat where id = v_message.chat_id and is_group = true
  ) then
    return new;
  end if;

  select id into v_binding_id
  from public.agent_binding
  where chat_id = v_message.chat_id
    and person_id = new.person_id
  order by created_at asc
  limit 1;

  if v_binding_id is not null and v_message.sender_person_id <> new.person_id then
    insert into public.agent_run_request (
      chat_id, message_id, requester_person_id, owner_person_id, agent_binding_id
    ) values (
      v_message.chat_id, v_message.id, v_message.sender_person_id, new.person_id, v_binding_id
    )
    on conflict (message_id, agent_binding_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists queue_team_agent_run_request_trigger on public.message_mention;
create trigger queue_team_agent_run_request_trigger
after insert on public.message_mention
for each row execute function public.queue_team_agent_run_request();

create or replace function public.decide_agent_run_request(
  p_request_id uuid,
  p_decision text,
  p_permission text default 'workspace_write'
)
returns public.agent_run_request
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.agent_run_request%rowtype;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;
  if p_permission not in ('read_only', 'workspace_write') then
    raise exception 'Invalid workspace permission' using errcode = '22023';
  end if;

  update public.agent_run_request request
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      permission = case when p_decision = 'approve' then 'workspace_write' else request.permission end,
      decided_at = now()
  from public.person owner
  where request.id = p_request_id
    and request.status in ('pending', 'failed')
    and owner.id = request.owner_person_id
    and owner.auth_user_id = auth.uid()
  returning request.* into v_request;

  if not found then
    raise exception 'Actionable request not found or not owned by this user' using errcode = '42501';
  end if;
  return v_request;
end;
$$;

create or replace function public.claim_agent_run_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.agent_run_request request
  set status = 'running', started_at = now()
  from public.person owner
  where request.id = p_request_id
    and request.status = 'approved'
    and owner.id = request.owner_person_id
    and owner.auth_user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.finish_agent_run_request(
  p_request_id uuid,
  p_succeeded boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.agent_run_request request
  set status = case when p_succeeded then 'completed' else 'failed' end,
      completed_at = now()
  from public.person owner
  where request.id = p_request_id
    and request.status = 'running'
    and owner.id = request.owner_person_id
    and owner.auth_user_id = auth.uid();
end;
$$;

revoke all on function public.decide_agent_run_request(uuid, text, text) from public;
revoke all on function public.claim_agent_run_request(uuid) from public;
revoke all on function public.finish_agent_run_request(uuid, boolean) from public;
grant execute on function public.decide_agent_run_request(uuid, text, text) to authenticated;
grant execute on function public.claim_agent_run_request(uuid) to authenticated;
grant execute on function public.finish_agent_run_request(uuid, boolean) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.agent_run_request;
exception
  when duplicate_object then null;
end;
$$;
