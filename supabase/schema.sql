create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create type user_role as enum ('super_admin', 'admin', 'member');
create type reservation_status as enum ('reserved', 'cancelled', 'attended');
create type application_status as enum ('pending', 'reviewing', 'rejected', 'approved', 'withdrawn');

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  password_hash text not null,
  university text not null default '',
  faculty text not null default '',
  department text not null default '',
  grade smallint not null default 1 check (grade between 1 and 6),
  instagram_id text,
  line_display_name text,
  tennis_experience text not null default '',
  has_racket boolean not null default false,
  avatar_url text,
  role user_role not null default 'member',
  session_version integer not null default 1 check (session_version > 0),
  created_at timestamptz not null default now()
);
create index users_name_idx on users using gin (name gin_trgm_ops);
create index users_university_idx on users (university);

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  capacity integer not null check (capacity > 0),
  description text,
  event_type text not null default 'tennis' check (event_type in ('tennis', 'event')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_starts_at_idx on events (starts_at);

create table event_documents (
  event_id uuid primary key references events(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  status reservation_status not null default 'reserved',
  created_at timestamptz not null default now(),
  unique(user_id, event_id)
);
create index reservations_event_idx on reservations (event_id, status);

create table membership_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  status application_status not null default 'pending',
  applied_at timestamptz not null default now()
);

create table app_settings (
  id smallint primary key default 1 check (id = 1),
  recruiting_open boolean not null default true,
  chatbot_enabled boolean not null default false,
  chatbot_admin_enabled boolean not null default false,
  chatbot_member_enabled boolean not null default false,
  chatbot_admin_sources text[] not null default '{}',
  chatbot_member_sources text[] not null default '{}',
  chatbot_faq_enabled boolean not null default false,
  chatbot_event_enabled boolean not null default true,
  chatbot_escalation_email text check (
    chatbot_escalation_email is null
    or (
      char_length(chatbot_escalation_email) <= 254
      and chatbot_escalation_email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
    )
  ),
  chatbot_fallback_message text not null default 'この質問はまだ回答データがありません。担当者が確認できるよう、回答内容を追加してください。'
);
insert into app_settings (id, recruiting_open) values (1, true);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);

create table membership_withdrawals (
  id bigint generated always as identity primary key,
  former_user_id uuid not null,
  name text not null,
  university text not null default '',
  faculty text not null default '',
  department text not null default '',
  grade smallint,
  instagram_id text,
  line_display_name text,
  tennis_experience text not null default '',
  has_racket boolean not null default false,
  reservation_history jsonb not null default '[]'::jsonb,
  withdrawal_source text not null check (withdrawal_source in ('self', 'admin')),
  withdrawn_by uuid references users(id) on delete set null,
  withdrawn_at timestamptz not null default now()
);

create table faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'その他',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faqs_display_order_idx on faqs (is_published, sort_order, created_at);

create table faq_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table faq_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  question text not null check (char_length(trim(question)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending', 'answered', 'dismissed')),
  published_faq_id uuid references faqs(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index faq_questions_status_created_idx on faq_questions (status, created_at);

create table chatbot_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 100),
  content text not null check (char_length(trim(content)) between 2 and 2000),
  category text not null default '基本情報' check (char_length(trim(category)) between 1 and 50),
  keywords text[] not null check (cardinality(keywords) between 1 and 20),
  priority integer not null default 0 check (priority between 0 and 100),
  is_active boolean not null default true,
  source_type text check (source_type in ('markdown')),
  source_name text,
  source_section text,
  source_hash text,
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chatbot_knowledge_active_priority_idx on chatbot_knowledge (is_active, priority desc, updated_at desc);
create unique index chatbot_knowledge_source_section_unique on chatbot_knowledge (source_hash, source_section);

create table chatbot_daily_usage (
  user_id uuid not null references users(id) on delete cascade,
  usage_date date not null,
  message_count integer not null default 0 check (message_count between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table login_rate_limits (
  key_hash text primary key check (char_length(key_hash) = 64),
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table app_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create or replace function consume_chatbot_message(p_user_id uuid, p_usage_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed integer;
begin
  insert into chatbot_daily_usage (user_id, usage_date, message_count)
  values (p_user_id, p_usage_date, 1)
  on conflict (user_id, usage_date) do update
    set message_count = chatbot_daily_usage.message_count + 1,
        updated_at = now()
    where chatbot_daily_usage.message_count < 10
  returning message_count into consumed;
  return consumed is not null;
end;
$$;

create or replace function check_login_rate_limit(p_key_hash text)
returns integer language sql security definer set search_path = public as $$
  select coalesce(greatest(0, ceil(extract(epoch from (blocked_until - now())))::integer), 0)
  from login_rate_limits where key_hash = p_key_hash;
$$;

create or replace function record_login_failure(p_key_hash text, p_window_seconds integer default 600, p_max_failures integer default 5, p_block_seconds integer default 600)
returns integer language plpgsql security definer set search_path = public as $$
declare v_blocked_until timestamptz;
begin
  if char_length(p_key_hash) <> 64 or p_window_seconds < 1 or p_max_failures < 1 or p_block_seconds < 1 then raise exception 'invalid login rate limit arguments'; end if;
  insert into login_rate_limits (key_hash, failure_count, window_started_at, blocked_until, updated_at)
  values (p_key_hash, 1, now(), case when p_max_failures = 1 then now() + make_interval(secs => p_block_seconds) end, now())
  on conflict (key_hash) do update set
    failure_count = case when login_rate_limits.blocked_until > now() then login_rate_limits.failure_count when login_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1 else login_rate_limits.failure_count + 1 end,
    window_started_at = case when login_rate_limits.blocked_until > now() then login_rate_limits.window_started_at when login_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now() else login_rate_limits.window_started_at end,
    blocked_until = case when login_rate_limits.blocked_until > now() then login_rate_limits.blocked_until when login_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then case when p_max_failures = 1 then now() + make_interval(secs => p_block_seconds) end when login_rate_limits.failure_count + 1 >= p_max_failures then now() + make_interval(secs => p_block_seconds) else null end,
    updated_at = now()
  returning blocked_until into v_blocked_until;
  return coalesce(greatest(0, ceil(extract(epoch from (v_blocked_until - now())))::integer), 0);
end;
$$;

create or replace function clear_login_rate_limit(p_key_hash text)
returns void language sql security definer set search_path = public as $$ delete from login_rate_limits where key_hash = p_key_hash; $$;

create or replace function consume_request_rate_limit(p_key_hash text, p_window_seconds integer, p_max_requests integer, p_block_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_limit login_rate_limits%rowtype;
begin
  if char_length(p_key_hash) <> 64 or p_window_seconds < 1 or p_max_requests < 1 or p_block_seconds < 1 then raise exception 'invalid request rate limit arguments'; end if;
  insert into login_rate_limits (key_hash, failure_count, window_started_at, updated_at) values (p_key_hash, 0, now(), now()) on conflict (key_hash) do nothing;
  select * into v_limit from login_rate_limits where key_hash = p_key_hash for update;
  if v_limit.blocked_until > now() then return false; end if;
  if v_limit.window_started_at <= now() - make_interval(secs => p_window_seconds) then
    update login_rate_limits set failure_count = 1, window_started_at = now(), blocked_until = null, updated_at = now() where key_hash = p_key_hash;
    return true;
  end if;
  if v_limit.failure_count >= p_max_requests then
    update login_rate_limits set blocked_until = now() + make_interval(secs => p_block_seconds), updated_at = now() where key_hash = p_key_hash;
    return false;
  end if;
  update login_rate_limits set failure_count = failure_count + 1, updated_at = now() where key_hash = p_key_hash;
  return true;
end;
$$;

create or replace function reserve_event(p_user_id uuid, p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_capacity integer; v_starts_at timestamptz; v_existing_status reservation_status; v_reserved_count integer;
begin
  if not exists (select 1 from users where id = p_user_id) then return 'user_not_found'; end if;
  select capacity, starts_at into v_capacity, v_starts_at from events where id = p_event_id for update;
  if not found then return 'event_not_found'; end if;
  if v_starts_at <= now() then return 'event_started'; end if;
  select status into v_existing_status from reservations where user_id = p_user_id and event_id = p_event_id;
  if v_existing_status in ('reserved', 'attended') then return 'already_reserved'; end if;
  select count(*)::integer into v_reserved_count from reservations where event_id = p_event_id and status = 'reserved';
  if v_reserved_count >= v_capacity then return 'full'; end if;
  insert into reservations (user_id, event_id, status) values (p_user_id, p_event_id, 'reserved')
  on conflict (user_id, event_id) do update set status = 'reserved';
  return 'reserved';
end;
$$;

create or replace function archive_and_delete_member(p_user_id uuid, p_withdrawn_by uuid, p_source text)
returns text language plpgsql security definer set search_path = public as $$
declare v_user users%rowtype; v_history jsonb;
begin
  if p_source not in ('self', 'admin') then return 'invalid_source'; end if;
  select * into v_user from users where id = p_user_id for update;
  if not found then return 'not_found'; end if;
  if v_user.role <> 'member' then return 'forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('status', r.status, 'created_at', r.created_at, 'event', jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'location', e.location)) order by r.created_at), '[]'::jsonb)
    into v_history from reservations r join events e on e.id = r.event_id where r.user_id = p_user_id;
  insert into membership_withdrawals (former_user_id, name, university, faculty, department, grade, instagram_id, line_display_name, tennis_experience, has_racket, reservation_history, withdrawal_source, withdrawn_by)
  values (v_user.id, v_user.name, v_user.university, v_user.faculty, v_user.department, v_user.grade, v_user.instagram_id, v_user.line_display_name, v_user.tennis_experience, v_user.has_racket, v_history, p_source, p_withdrawn_by);
  insert into audit_logs (actor_id, action, target_type, target_id) values (p_withdrawn_by, case when p_source = 'self' then 'account.delete.self' else 'account.delete.admin' end, 'user', p_user_id);
  delete from users where id = p_user_id;
  return 'deleted';
end;
$$;

create or replace function cancel_event_reservation(p_user_id uuid, p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_starts_at timestamptz;
begin
  select starts_at into v_starts_at from events where id = p_event_id for update;
  if not found then return 'event_not_found'; end if;
  if v_starts_at - now() < interval '2 hours' then return 'deadline_passed'; end if;
  update reservations set status = 'cancelled'
    where user_id = p_user_id and event_id = p_event_id and status = 'reserved';
  if not found then return 'not_reserved'; end if;
  return 'cancelled';
end;
$$;

create or replace function update_event_metadata(
  p_actor uuid,
  p_event_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_capacity integer,
  p_description text,
  p_event_type text
)
returns text language plpgsql security definer set search_path = public as $$
declare v_reserved integer;
begin
  if not exists (select 1 from users where id = p_actor and role in ('admin', 'super_admin')) then return 'forbidden'; end if;
  if p_title is null
     or p_starts_at is null
     or p_ends_at is null
     or p_location is null
     or p_capacity is null
     or p_event_type is null
     or p_capacity < 1
     or p_ends_at <= p_starts_at
     or p_event_type not in ('tennis', 'event')
     or char_length(btrim(p_title)) not between 1 and 160
     or char_length(btrim(p_location)) not between 1 and 160
     or char_length(coalesce(p_description, '')) > 5000 then return 'invalid'; end if;
  perform 1 from events where id = p_event_id for update;
  if not found then return 'not_found'; end if;
  select count(*)::integer into v_reserved from reservations where event_id = p_event_id and status = 'reserved';
  if p_capacity < v_reserved then return 'capacity'; end if;
  update events set
    title = p_title,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    location = p_location,
    capacity = p_capacity,
    description = p_description,
    event_type = p_event_type
  where id = p_event_id;
  insert into audit_logs(actor_id, action, target_type, target_id)
  values (p_actor, 'event.update', 'event', p_event_id);
  return 'updated';
end;
$$;

create or replace function set_user_role_atomic(p_actor uuid, p_user_id uuid, p_role user_role)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from users where id = p_actor and role = 'super_admin') then raise exception 'Forbidden'; end if;
  if p_user_id is null or p_role is null or p_user_id = p_actor then raise exception 'Cannot change own role'; end if;
  perform 1 from users where id = p_user_id for update;
  if not found then return false; end if;
  update users set role = p_role, session_version = session_version + 1 where id = p_user_id;
  insert into audit_logs(actor_id, action, target_type, target_id)
  values (p_actor, 'user.role.update', 'user', p_user_id);
  return true;
end;
$$;

create or replace function set_members_role_atomic(p_actor uuid, p_user_ids uuid[], p_role user_role)
returns integer language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_updated integer;
begin
  if not exists (select 1 from users where id = p_actor and role = 'super_admin') then raise exception 'Forbidden'; end if;
  if p_role is null
     or p_role not in ('admin', 'super_admin')
     or p_user_ids is null
     or cardinality(p_user_ids) not between 1 and 500
     or array_position(p_user_ids, null) is not null then raise exception 'Invalid targets'; end if;
  select array_agg(distinct target_id order by target_id) into v_ids from unnest(p_user_ids) as targets(target_id);
  if cardinality(v_ids) <> cardinality(p_user_ids) or p_actor = any(v_ids) then raise exception 'Invalid targets'; end if;
  perform 1 from users where id = any(v_ids) order by id for update;
  if (select count(*) from users where id = any(v_ids) and role = 'member') <> cardinality(v_ids) then
    raise exception 'Target list changed';
  end if;
  update users set role = p_role, session_version = session_version + 1 where id = any(v_ids) and role = 'member';
  get diagnostics v_updated = row_count;
  if v_updated <> cardinality(v_ids) then raise exception 'Target list changed'; end if;
  insert into audit_logs(actor_id, action, target_type, target_id)
  select p_actor, 'user.role.update', 'user', target_id from unnest(v_ids) as targets(target_id);
  return v_updated;
end;
$$;

create or replace function replace_user_password(p_user_id uuid, p_password_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if char_length(p_password_hash) < 20 then raise exception 'invalid password hash'; end if;
  update users set password_hash = p_password_hash, session_version = session_version + 1 where id = p_user_id;
  return found;
end;
$$;

create or replace function promote_member_grades(p_year integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_action text; v_updated integer;
begin
  if p_year < 2000 or p_year > 3000 then raise exception 'invalid promotion year'; end if;
  v_action := 'grade.promote.' || p_year::text;
  perform pg_advisory_xact_lock(hashtextextended(v_action, 0));
  if exists (select 1 from audit_logs where action = v_action) then return jsonb_build_object('updated', 0, 'skipped', true); end if;
  update users set grade = least(grade + 1, 5) where role = 'member' and grade < 5;
  get diagnostics v_updated = row_count;
  insert into audit_logs (action, target_type) values (v_action, 'users');
  return jsonb_build_object('updated', v_updated, 'skipped', false);
end;
$$;

alter table users enable row level security;
alter table events enable row level security;
alter table event_documents enable row level security;
alter table reservations enable row level security;
alter table membership_applications enable row level security;
alter table app_settings enable row level security;
alter table audit_logs enable row level security;
alter table membership_withdrawals enable row level security;
alter table faqs enable row level security;
alter table faq_categories enable row level security;
alter table faq_questions enable row level security;
alter table chatbot_knowledge enable row level security;
alter table chatbot_daily_usage enable row level security;
alter table login_rate_limits enable row level security;
alter table app_schema_migrations enable row level security;

grant select, insert, update, delete on table faq_questions to service_role;
grant select, insert, update, delete on table chatbot_knowledge to service_role;
grant select, insert, update, delete on table chatbot_daily_usage to service_role;
grant select, insert, update, delete on table login_rate_limits to service_role;
grant select, insert on table app_schema_migrations to service_role;
revoke all on function consume_chatbot_message(uuid, date) from public;
grant execute on function consume_chatbot_message(uuid, date) to service_role;
revoke all on function check_login_rate_limit(text) from public;
revoke all on function record_login_failure(text, integer, integer, integer) from public;
revoke all on function clear_login_rate_limit(text) from public;
revoke all on function consume_request_rate_limit(text, integer, integer, integer) from public;
revoke all on function reserve_event(uuid, uuid) from public;
revoke all on function archive_and_delete_member(uuid, uuid, text) from public;
revoke all on function cancel_event_reservation(uuid, uuid) from public;
revoke all on function update_event_metadata(uuid, uuid, text, timestamptz, timestamptz, text, integer, text, text) from public;
revoke all on function set_user_role_atomic(uuid, uuid, user_role) from public;
revoke all on function set_members_role_atomic(uuid, uuid[], user_role) from public;
revoke all on function replace_user_password(uuid, text) from public;
revoke all on function promote_member_grades(integer) from public;
grant execute on function check_login_rate_limit(text) to service_role;
grant execute on function record_login_failure(text, integer, integer, integer) to service_role;
grant execute on function clear_login_rate_limit(text) to service_role;
grant execute on function consume_request_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function reserve_event(uuid, uuid) to service_role;
grant execute on function archive_and_delete_member(uuid, uuid, text) to service_role;
grant execute on function cancel_event_reservation(uuid, uuid) to service_role;
grant execute on function update_event_metadata(uuid, uuid, text, timestamptz, timestamptz, text, integer, text, text) to service_role;
grant execute on function set_user_role_atomic(uuid, uuid, user_role) to service_role;
grant execute on function set_members_role_atomic(uuid, uuid[], user_role) to service_role;
grant execute on function replace_user_password(uuid, text) to service_role;
grant execute on function promote_member_grades(integer) to service_role;

-- This app only accesses the database from trusted Next.js server code using the service role.
-- Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.

-- Chatbot experience (2026-09-06)
begin;

alter table public.chatbot_knowledge add column if not exists embedding real[];
alter table public.faqs add column if not exists embedding real[];
-- Keep the old upsert constraint compatible with the currently deployed application.
create index if not exists chatbot_knowledge_source_name_idx
  on public.chatbot_knowledge(source_name);

create or replace function public.replace_chatbot_source(p_actor uuid, p_name text, p_hash text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not exists(select 1 from users where id = p_actor and role = 'super_admin') then raise exception 'Forbidden'; end if;
  if p_name is null or length(p_name) not between 1 and 255 or p_name !~* '\.md$'
    or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid source'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count not between 1 and 1000 then raise exception 'Invalid record count'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chatbot.source.' || p_name, 0));
  delete from chatbot_knowledge where source_type = 'markdown' and source_name = p_name;
  insert into chatbot_knowledge(title,content,category,keywords,source_type,source_name,source_section,source_hash,created_by,updated_by,embedding)
    select r.title,r.content,r.category,r.keywords,'markdown',p_name,r.source_section,p_name || ':' || p_hash,p_actor,p_actor,r.embedding
    from jsonb_to_recordset(p_rows) as r(title text,content text,category text,keywords text[],source_section text,embedding real[]);
  if exists(select 1 from chatbot_knowledge where source_name = p_name and (embedding is null or cardinality(embedding) <> 768)) then
    raise exception 'Incomplete embeddings';
  end if;
  insert into audit_logs(actor_id,action,target_type) values(p_actor,'chatbot.knowledge.import_markdown','chatbot_knowledge');
  return v_count;
end $$;

create or replace function public.chatbot_source_inventory()
returns table(source_name text, record_count bigint, updated_at timestamptz, embedded_count bigint)
language sql stable security definer set search_path = public as $$
  select k.source_name,count(*),max(k.updated_at),count(k.embedding)
  from chatbot_knowledge k where source_type = 'markdown' group by k.source_name order by k.source_name;
$$;

create or replace function public.chatbot_semantic_matches(p_sources text[], p_query real[])
returns table(id uuid, similarity double precision)
language sql stable security definer set search_path = public as $$
  with permitted as (
    select k.id,k.embedding from chatbot_knowledge k where k.source_type = 'markdown' and k.source_name = any(p_sources)
    union all select f.id,f.embedding from faqs f where f.is_published = true
  ), scored as (
    select p.id, (select sum(v::double precision * p_query[i]) /
      nullif(sqrt(sum(v::double precision * v)) * sqrt(sum(p_query[i]::double precision * p_query[i])),0)
      from unnest(p.embedding) with ordinality as e(v,i)) as similarity
    from permitted p where cardinality(p.embedding) = 768 and cardinality(p_query) = 768
  ) select * from scored where similarity >= 0.68 order by similarity desc limit 20;
$$;

create or replace function public.reorder_faqs(p_actor uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from users where id=p_actor and role in ('admin','super_admin')) then raise exception 'Forbidden'; end if;
  lock table faqs in share row exclusive mode;
  if p_ids is null or cardinality(p_ids) > 10000 or cardinality(p_ids) <> (select count(*) from faqs)
    or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
    or exists(select 1 from unnest(p_ids) x where not exists(select 1 from faqs where id=x)) then raise exception 'FAQ list changed'; end if;
  update faqs f set sort_order=s.n-1, updated_at=now() from unnest(p_ids) with ordinality s(id,n) where f.id=s.id;
  insert into audit_logs(actor_id,action,target_type) values(p_actor,'faq.reorder','faq');
end $$;

revoke all on function public.replace_chatbot_source(uuid,text,text,jsonb) from public;
revoke all on function public.chatbot_source_inventory() from public;
revoke all on function public.chatbot_semantic_matches(text[],real[]) from public;
revoke all on function public.reorder_faqs(uuid,uuid[]) from public;
grant execute on function public.replace_chatbot_source(uuid,text,text,jsonb), public.chatbot_source_inventory(), public.chatbot_semantic_matches(text[],real[]), public.reorder_faqs(uuid,uuid[]) to service_role;
notify pgrst, 'reload schema';
commit;

begin;

create table if not exists public.ops_notification_settings (
  id smallint primary key default 1 check (id = 1),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  health_enabled boolean not null default false,
  errors_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((not health_enabled and not errors_enabled) or email is not null)
);
insert into public.ops_notification_settings(id) values(1) on conflict do nothing;
alter table public.ops_notification_settings enable row level security;
revoke all on public.ops_notification_settings from public;
grant select,insert,update,delete on public.ops_notification_settings to service_role;

create table if not exists public.ops_notification_deliveries (
  delivery_key text primary key check (length(delivery_key) between 1 and 128),
  lease uuid,
  leased_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ops_notification_deliveries enable row level security;
revoke all on public.ops_notification_deliveries from public;
grant select,insert,update,delete on public.ops_notification_deliveries to service_role;

create or replace function public.update_ops_notification_settings(p_actor uuid,p_email text,p_health boolean,p_errors boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from users where id=p_actor and role='super_admin') then raise exception 'Forbidden'; end if;
  if p_health is null or p_errors is null then raise exception 'Invalid settings'; end if;
  update ops_notification_settings set email=nullif(trim(p_email),''),health_enabled=p_health,errors_enabled=p_errors,updated_at=clock_timestamp() where id=1;
  if not found then raise exception 'Missing settings'; end if;
  insert into audit_logs(actor_id,action,target_type) values(p_actor,'ops.notification.settings.update','ops_settings');
end $$;

create or replace function public.claim_ops_delivery(p_key text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_lease uuid := gen_random_uuid(); v_sent timestamptz; v_until timestamptz;
begin
  insert into ops_notification_deliveries(delivery_key) values(p_key) on conflict do nothing;
  select sent_at,leased_until into v_sent,v_until from ops_notification_deliveries where delivery_key=p_key for update;
  if v_sent is not null or v_until>now() then return null; end if;
  update ops_notification_deliveries set lease=v_lease,leased_until=now()+interval '2 minutes' where delivery_key=p_key;
  return v_lease;
end $$;

create or replace function public.finish_ops_delivery(p_key text,p_lease uuid,p_sent boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  update ops_notification_deliveries set sent_at=case when p_sent then now() else sent_at end,leased_until=null,lease=null
  where delivery_key=p_key and lease=p_lease;
end $$;

revoke all on function public.update_ops_notification_settings(uuid,text,boolean,boolean),public.claim_ops_delivery(text),public.finish_ops_delivery(text,uuid,boolean) from public;
grant execute on function public.update_ops_notification_settings(uuid,text,boolean,boolean),public.claim_ops_delivery(text),public.finish_ops_delivery(text,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
