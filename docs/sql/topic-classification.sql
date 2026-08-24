-- Versioned topic catalog and auditable local classification results.
-- The platform owns definitions and results; an authenticated connector only
-- performs local embedding inference and records a result for its own binding.

create table if not exists public.topic_catalog_state (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.topic_catalog_state (singleton, version)
values (true, 1)
on conflict (singleton) do nothing;

create table if not exists public.topic_definition (
  slug text primary key check (slug ~ '^[a-z][a-z0-9_]{0,39}$'),
  name text not null,
  description text not null,
  examples jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.bump_topic_catalog_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.topic_catalog_state
  set version = version + 1, updated_at = now()
  where singleton = true;
  return null; -- return value is ignored by this AFTER STATEMENT trigger
end;
$$;

drop trigger if exists bump_topic_catalog_version_trigger on public.topic_definition;
create trigger bump_topic_catalog_version_trigger
after insert or update or delete on public.topic_definition
for each statement execute function public.bump_topic_catalog_version();

insert into public.topic_definition (slug, name, description, examples) values
  ('general', 'General', 'General coordination, greetings, or work that does not strongly match another topic.', '["Are you there?", "What should we do next?"]'),
  ('api', 'API', 'API contracts, HTTP routes, endpoints, request or response payloads, and service integration.', '["Update the endpoint", "What does the API return?"]'),
  ('deployment', 'Deployment', 'Releases, production deployment, hosting, environments, rollout, and shipping software.', '["Deploy this change", "Is the release live?"]'),
  ('bugs', 'Bugs', 'Errors, crashes, regressions, broken behavior, investigation, and fixes.', '["Fix this error", "Why did the test regress?"]'),
  ('timeline', 'Timeline', 'Deadlines, estimates, delivery dates, sequencing, and how long work will take.', '["When will this be ready?", "What is the ETA?"]'),
  ('architecture', 'Architecture', 'System design, component boundaries, dependencies, data flow, and technical structure.', '["Should we change the architecture?", "Where should this logic live?"]'),
  ('frontend', 'Frontend', 'User interfaces, browser behavior, styling, accessibility, and client-side application work.', '["Update the chat UI", "The button is not visible"]'),
  ('database', 'Database', 'Database schema, SQL, migrations, queries, constraints, policies, and stored procedures.', '["Add a Postgres table", "This RLS policy fails"]'),
  ('testing', 'Testing', 'Automated tests, manual verification, UAT, test failures, and quality assurance.', '["Run the regression suite", "Add a Playwright test"]'),
  ('security', 'Security', 'Authentication, authorization, permissions, secrets, privacy, and security boundaries.', '["Review the RLS policy", "Rotate the exposed key"]')
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    examples = excluded.examples,
    updated_at = now();

create table if not exists public.message_topic_classification (
  message_id uuid not null references public.message(id) on delete cascade,
  agent_binding_id uuid not null references public.agent_binding(id) on delete cascade,
  topic_slug text not null references public.topic_definition(slug),
  confidence double precision check (confidence is null or confidence between -1 and 1),
  source text not null check (source in ('local_embedding', 'keyword_fallback')),
  model_id text,
  model_version text,
  topic_catalog_version bigint not null,
  created_at timestamptz not null default now(),
  primary key (message_id, agent_binding_id)
);

create index if not exists message_topic_classification_binding_created_idx
  on public.message_topic_classification(agent_binding_id, created_at desc);

alter table public.topic_catalog_state enable row level security;
alter table public.topic_definition enable row level security;
alter table public.message_topic_classification enable row level security;
revoke all on public.topic_catalog_state, public.topic_definition, public.message_topic_classification from anon, authenticated;
grant select on public.message_topic_classification to authenticated;

create or replace function public.get_topic_catalog_version()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select version from public.topic_catalog_state where singleton = true;
$$;

create or replace function public.get_topic_definitions()
returns setof public.topic_definition
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.topic_definition where active order by slug;
$$;

create or replace function public.record_message_topic_classification(
  p_message_id uuid,
  p_agent_binding_id uuid,
  p_topic_slug text,
  p_confidence double precision,
  p_source text,
  p_model_id text,
  p_model_version text,
  p_topic_catalog_version bigint
)
returns public.message_topic_classification
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.message_topic_classification%rowtype;
begin
  if p_source not in ('local_embedding', 'keyword_fallback') then
    raise exception 'Invalid classification source' using errcode = '22023';
  end if;
  if p_topic_catalog_version < 1 then
    raise exception 'Invalid topic catalog version' using errcode = '22023';
  end if;
  if not exists (select 1 from public.topic_definition where slug = p_topic_slug and active) then
    raise exception 'Unknown or inactive topic' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.agent_binding binding
    join public.person owner on owner.id = binding.person_id
    join public.message message
      on message.id = p_message_id and message.chat_id = binding.chat_id
    where binding.id = p_agent_binding_id
      and owner.auth_user_id = auth.uid()
      and (
        exists (
          select 1 from public.message_agent_mention agent_mention
          where agent_mention.message_id = message.id
            and agent_mention.agent_binding_id = binding.id
        )
        or exists (
          select 1 from public.message_mention person_mention
          where person_mention.message_id = message.id
            and person_mention.person_id = binding.person_id
        )
      )
  ) then
    raise exception 'Owned binding and matching structured mention required' using errcode = '42501';
  end if;

  insert into public.message_topic_classification (
    message_id, agent_binding_id, topic_slug, confidence, source,
    model_id, model_version, topic_catalog_version
  ) values (
    p_message_id, p_agent_binding_id, p_topic_slug, p_confidence, p_source,
    p_model_id, p_model_version, p_topic_catalog_version
  )
  on conflict (message_id, agent_binding_id) do nothing
  returning * into v_result;

  if not found then
    select * into v_result
    from public.message_topic_classification
    where message_id = p_message_id and agent_binding_id = p_agent_binding_id;
  end if;
  return v_result;
end;
$$;

create or replace function public.can_read_message_topic_classification(
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
    from public.agent_binding binding
    join public.person owner on owner.id = binding.person_id
    where binding.id = p_agent_binding_id
      and owner.auth_user_id = auth.uid()
  );
$$;

drop policy if exists "owners can read topic classifications" on public.message_topic_classification;
create policy "owners can read topic classifications"
on public.message_topic_classification for select to authenticated
using (public.can_read_message_topic_classification(message_id, agent_binding_id));

revoke all on function public.get_topic_catalog_version() from public;
revoke all on function public.get_topic_definitions() from public;
revoke all on function public.record_message_topic_classification(uuid, uuid, text, double precision, text, text, text, bigint) from public;
revoke all on function public.can_read_message_topic_classification(uuid, uuid) from public;
grant execute on function public.get_topic_catalog_version() to authenticated;
grant execute on function public.get_topic_definitions() to authenticated;
grant execute on function public.record_message_topic_classification(uuid, uuid, text, double precision, text, text, text, bigint) to authenticated;
grant execute on function public.can_read_message_topic_classification(uuid, uuid) to authenticated;
