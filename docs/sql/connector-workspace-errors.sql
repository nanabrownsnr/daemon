-- Show local agent launch/runtime errors in the owner's Agent Workspace and
-- suppress duplicate unresolved responses for one binding/message pair.
-- Run once in the Supabase SQL editor before deploying the matching app and
-- connector versions.

alter table public.private_thread_message
  add column if not exists is_error boolean not null default false;

-- Preserve old rows while resolving extra active copies, so existing unsent
-- drafts are not deleted during migration.
with duplicate_drafts as (
  select id,
    row_number() over (
      partition by agent_binding_id, trigger_message_id
      order by created_at asc, id asc
    ) as position
  from public.private_thread_message
  where sender_type = 'agent'
    and agent_binding_id is not null
    and trigger_message_id is not null
    and resolved_at is null
)
update public.private_thread_message draft
set resolved_at = now()
from duplicate_drafts duplicate
where draft.id = duplicate.id
  and duplicate.position > 1;

create unique index if not exists private_thread_message_one_open_response_per_mention
  on public.private_thread_message (agent_binding_id, trigger_message_id)
  where sender_type = 'agent'
    and agent_binding_id is not null
    and trigger_message_id is not null
    and resolved_at is null;
