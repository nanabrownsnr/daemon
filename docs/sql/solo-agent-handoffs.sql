-- Enable an agent in a Solo chat to explicitly hand work to another local
-- agent by naming that binding in its response. Run before deploying the
-- connector code that uses send_agent_handoff.

alter table public.message
  add column if not exists agent_handoff_chain uuid[] not null default '{}'::uuid[];

create or replace function public.send_agent_handoff(
  p_chat_id uuid,
  p_source_binding_id uuid,
  p_target_binding_id uuid,
  p_body text,
  p_handoff_chain uuid[]
)
returns public.message
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person_id uuid;
  v_message public.message%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception 'Handoff message cannot be empty' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_handoff_chain), 0) < 1
     or array_position(p_handoff_chain, null::uuid) is not null
     or cardinality(p_handoff_chain) <> (
       select count(distinct binding_id)
       from unnest(p_handoff_chain) as chain(binding_id)
     )
     or p_handoff_chain[cardinality(p_handoff_chain)] <> p_source_binding_id
     or p_target_binding_id = any(p_handoff_chain) then
    raise exception 'Invalid Solo handoff chain or loop detected' using errcode = '22023';
  end if;

  select id into v_person_id
  from public.person
  where auth_user_id = auth.uid();

  if v_person_id is null
     or not exists (
       select 1
       from public.chat chat
       join public.agent_binding source_binding
         on source_binding.chat_id = chat.id
        and source_binding.person_id = v_person_id
        and source_binding.id = p_source_binding_id
       join public.agent_binding target_binding
         on target_binding.chat_id = chat.id
        and target_binding.person_id = v_person_id
        and target_binding.id = p_target_binding_id
       where chat.id = p_chat_id
         and chat.is_group = false
     ) then
    raise exception 'Both agents must belong to your Solo chat' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(p_handoff_chain) as chain(chain_binding_id)
    where not exists (
      select 1
      from public.agent_binding chain_binding
      where chain_binding.id = chain_binding_id
        and chain_binding.chat_id = p_chat_id
        and chain_binding.person_id = v_person_id
    )
  ) then
    raise exception 'Every agent in the handoff chain must belong to your Solo chat' using errcode = '42501';
  end if;

  insert into public.message (
    chat_id, sender_person_id, sender_type, agent_binding_id,
    mode, body, agent_handoff_chain
  ) values (
    p_chat_id, v_person_id, 'agent', p_source_binding_id,
    'act', btrim(p_body), p_handoff_chain
  ) returning * into v_message;

  insert into public.message_agent_mention (message_id, agent_binding_id)
  values (v_message.id, p_target_binding_id);

  return v_message;
end;
$$;

revoke all on function public.send_agent_handoff(uuid, uuid, uuid, text, uuid[]) from public;
grant execute on function public.send_agent_handoff(uuid, uuid, uuid, text, uuid[]) to authenticated;
