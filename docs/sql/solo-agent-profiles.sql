-- Editable Solo agent names and owner-provided routing profiles.
-- Run before deploying the app/connector changes that read these columns.

alter table public.agent_binding
  add column if not exists agent_role text,
  add column if not exists agent_description text;

comment on column public.agent_binding.agent_role is
  'Owner-provided short role label used to help Solo agents route work.';
comment on column public.agent_binding.agent_description is
  'Owner-provided agent strengths, project scope, and boundaries used for Solo handoffs.';
