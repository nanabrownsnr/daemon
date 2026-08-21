-- Atomic correction for a sent agent message.
-- Run once in the Supabase SQL editor.

create or replace function public.edit_agent_message(
  p_message_id uuid,
  p_body text,
  p_edit_distance int default null
)
returns public.message
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person_id uuid;
  v_original public.message%rowtype;
  v_updated public.message%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(btrim(p_body), '') is null then
    raise exception 'Message body cannot be empty' using errcode = '22023';
  end if;

  select id
  into v_person_id
  from public.person
  where auth_user_id = auth.uid();

  if v_person_id is null then
    raise exception 'Person record not found' using errcode = '42501';
  end if;

  select *
  into v_original
  from public.message
  where id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;

  if v_original.sender_person_id <> v_person_id
     or v_original.sender_type::text <> 'agent'
     or v_original.agent_binding_id is null then
    raise exception 'Only the owner can edit their sent agent message' using errcode = '42501';
  end if;

  update public.message
  set body = btrim(p_body),
      was_edited = true
  where id = p_message_id
  returning * into v_updated;

  if not coalesce(v_original.was_edited, false) then
    insert into public.judgment_event (
      person_id,
      agent_binding_id,
      message_id,
      signal,
      topic_tag,
      relationship_category,
      edit_distance
    ) values (
      v_person_id,
      v_original.agent_binding_id,
      v_original.id,
      'corrected_after_send',
      coalesce(v_original.topic_tag, 'general'),
      'internal_team',
      greatest(coalesce(p_edit_distance, 0), 0)
    );
  end if;

  return v_updated;
end;
$$;

revoke all on function public.edit_agent_message(uuid, text, int) from public;
grant execute on function public.edit_agent_message(uuid, text, int) to authenticated;

-- Corrections must go through the transaction above; prevent authenticated
-- clients from bypassing judgment-event recording with a direct table update.
drop policy if exists "owners can edit own agent messages" on public.message;
revoke update on public.message from anon, authenticated;
