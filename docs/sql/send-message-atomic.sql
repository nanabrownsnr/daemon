-- Atomic human message delivery with structured Team or Solo mentions.
-- Run once in the Supabase SQL editor before deploying the matching web app.

create or replace function public.send_message_with_mentions(
  p_chat_id uuid,
  p_body text,
  p_person_mentions uuid[] default '{}'::uuid[],
  p_agent_mentions uuid[] default '{}'::uuid[]
)
returns public.message
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person_id uuid;
  v_is_group boolean;
  v_message public.message%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception 'Message body cannot be empty' using errcode = '22023';
  end if;

  select person.id into v_person_id
  from public.person person
  where person.auth_user_id = auth.uid();

  select chat.is_group into v_is_group
  from public.chat chat
  join public.chat_member member
    on member.chat_id = chat.id and member.person_id = v_person_id
  where chat.id = p_chat_id;

  if v_person_id is null or v_is_group is null then
    raise exception 'Chat membership required' using errcode = '42501';
  end if;

  if v_is_group and cardinality(coalesce(p_agent_mentions, '{}'::uuid[])) > 0 then
    raise exception 'Team chats mention people, not agent bindings' using errcode = '22023';
  end if;
  if not v_is_group and cardinality(coalesce(p_person_mentions, '{}'::uuid[])) > 0 then
    raise exception 'Solo chats mention agent bindings, not people' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_person_mentions, '{}'::uuid[])) mentioned(person_id)
    where not exists (
      select 1 from public.chat_member member
      where member.chat_id = p_chat_id and member.person_id = mentioned.person_id
    )
  ) then
    raise exception 'Every mentioned person must belong to the chat' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_agent_mentions, '{}'::uuid[])) mentioned(binding_id)
    where not exists (
      select 1 from public.agent_binding binding
      where binding.id = mentioned.binding_id
        and binding.chat_id = p_chat_id
        and binding.person_id = v_person_id
    )
  ) then
    raise exception 'Every mentioned Solo agent must be owned by the sender and bound to this chat'
      using errcode = '42501';
  end if;

  insert into public.message (chat_id, sender_person_id, sender_type, body)
  values (p_chat_id, v_person_id, 'human', btrim(p_body))
  returning * into v_message;

  insert into public.message_mention (message_id, person_id)
  select v_message.id, mentioned.person_id
  from (
    select distinct unnest(coalesce(p_person_mentions, '{}'::uuid[])) as person_id
  ) mentioned;

  insert into public.message_agent_mention (message_id, agent_binding_id)
  select v_message.id, mentioned.binding_id
  from (
    select distinct unnest(coalesce(p_agent_mentions, '{}'::uuid[])) as binding_id
  ) mentioned;

  return v_message;
end;
$$;

revoke all on function public.send_message_with_mentions(uuid, text, uuid[], uuid[]) from public;
grant execute on function public.send_message_with_mentions(uuid, text, uuid[], uuid[]) to authenticated;
