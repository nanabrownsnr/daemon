-- Optional GitHub repository context for each chat.
-- Run once in the Supabase SQL editor before deploying the matching app.

alter table public.chat
  add column if not exists github_url text;

do $$
begin
  alter table public.chat
    add constraint chat_github_url_check
    check (github_url is null or (
      length(github_url) <= 2048
      and github_url ~* '^https?://([^/]+\.)?github\.com/[^/]+/[^/]+/?$'
    ));
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.set_chat_github_url(
  p_chat_id uuid,
  p_github_url text
)
returns public.chat
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person_id uuid;
  v_chat public.chat%rowtype;
  v_url text := nullif(btrim(p_github_url), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_url is not null and (
    length(v_url) > 2048
    or v_url !~* '^https?://([^/]+\.)?github\.com/[^/]+/[^/]+/?$'
  ) then
    raise exception 'Enter a valid GitHub repository URL' using errcode = '22023';
  end if;

  select id into v_person_id from public.person where auth_user_id = auth.uid();
  update public.chat set github_url = v_url
  where id = p_chat_id and created_by = v_person_id
  returning * into v_chat;

  if not found then
    raise exception 'Only the chat owner can update its GitHub repository' using errcode = '42501';
  end if;
  return v_chat;
end;
$$;

revoke all on function public.set_chat_github_url(uuid, text) from public;
grant execute on function public.set_chat_github_url(uuid, text) to authenticated;
