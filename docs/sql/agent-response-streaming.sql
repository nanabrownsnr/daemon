-- Capability-based agent response streaming for shared chat and Agent Workspace.
-- Run once in the Supabase SQL editor before installing connector 0.7.0.

alter table public.message
  add column if not exists response_status text not null default 'completed'
  check (response_status in ('streaming', 'completed', 'failed'));

alter table public.message
  add column if not exists stream_sequence bigint not null default 0
  check (stream_sequence >= 0);

alter table public.private_thread_message
  add column if not exists response_status text not null default 'completed'
  check (response_status in ('streaming', 'completed', 'failed'));

alter table public.private_thread_message
  add column if not exists stream_sequence bigint not null default 0
  check (stream_sequence >= 0);

create or replace function public.update_agent_response_stream(
  p_destination text,
  p_response_id uuid,
  p_body text,
  p_sequence bigint,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_destination not in ('chat', 'private') then
    raise exception 'Invalid stream destination' using errcode = '22023';
  end if;
  if p_status not in ('streaming', 'completed', 'failed') then
    raise exception 'Invalid response status' using errcode = '22023';
  end if;
  if p_sequence < 1 then
    raise exception 'Stream sequence must be positive' using errcode = '22023';
  end if;

  select id into v_person_id
  from public.person
  where auth_user_id = auth.uid();

  if v_person_id is null then
    raise exception 'Person record not found' using errcode = '42501';
  end if;

  if p_destination = 'chat' then
    update public.message response
    set body = p_body,
        stream_sequence = p_sequence,
        response_status = p_status
    where response.id = p_response_id
      and response.sender_person_id = v_person_id
      and response.sender_type::text = 'agent'
      and response.agent_binding_id in (
        select binding.id from public.agent_binding binding
        where binding.person_id = v_person_id
      )
      and response.stream_sequence < p_sequence;
  else
    update public.private_thread_message response
    set body = p_body,
        stream_sequence = p_sequence,
        response_status = p_status
    where response.id = p_response_id
      and response.person_id = v_person_id
      and response.sender_type::text = 'agent'
      and response.agent_binding_id in (
        select binding.id from public.agent_binding binding
        where binding.person_id = v_person_id
      )
      and response.stream_sequence < p_sequence;
  end if;

  return found;
end;
$$;

revoke all on function public.update_agent_response_stream(text, uuid, text, bigint, text) from public;
grant execute on function public.update_agent_response_stream(text, uuid, text, bigint, text) to authenticated;
