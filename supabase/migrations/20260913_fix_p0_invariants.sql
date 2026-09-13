begin;

create or replace function public.update_event_metadata(
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
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved integer;
begin
  if not exists (
    select 1
    from public.users
    where id = p_actor
      and role in ('admin', 'super_admin')
  ) then
    return 'forbidden';
  end if;

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
     or char_length(coalesce(p_description, '')) > 5000 then
    return 'invalid';
  end if;

  perform 1
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return 'not_found';
  end if;

  select count(*)::integer
    into v_reserved
  from public.reservations
  where event_id = p_event_id
    and status = 'reserved';

  if p_capacity < v_reserved then
    return 'capacity';
  end if;

  update public.events
  set
    title = p_title,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    location = p_location,
    capacity = p_capacity,
    description = p_description,
    event_type = p_event_type
  where id = p_event_id;

  insert into public.audit_logs(actor_id, action, target_type, target_id)
  values (p_actor, 'event.update', 'event', p_event_id);

  return 'updated';
end;
$$;

create or replace function public.set_user_role_atomic(
  p_actor uuid,
  p_user_id uuid,
  p_role public.user_role
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.users
    where id = p_actor
      and role = 'super_admin'
  ) then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null or p_role is null or p_user_id = p_actor then
    raise exception 'Cannot change own role';
  end if;

  perform 1
  from public.users
  where id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  update public.users
  set
    role = p_role,
    session_version = session_version + 1
  where id = p_user_id;

  insert into public.audit_logs(actor_id, action, target_type, target_id)
  values (p_actor, 'user.role.update', 'user', p_user_id);

  return true;
end;
$$;

create or replace function public.set_members_role_atomic(
  p_actor uuid,
  p_user_ids uuid[],
  p_role public.user_role
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_updated integer;
begin
  if not exists (
    select 1
    from public.users
    where id = p_actor
      and role = 'super_admin'
  ) then
    raise exception 'Forbidden';
  end if;

  if p_role is null
     or p_role not in ('admin', 'super_admin')
     or p_user_ids is null
     or cardinality(p_user_ids) not between 1 and 500
     or array_position(p_user_ids, null) is not null then
    raise exception 'Invalid targets';
  end if;

  select array_agg(distinct target_id order by target_id)
    into v_ids
  from unnest(p_user_ids) as targets(target_id);

  if cardinality(v_ids) <> cardinality(p_user_ids)
     or p_actor = any(v_ids) then
    raise exception 'Invalid targets';
  end if;

  perform 1
  from public.users
  where id = any(v_ids)
  order by id
  for update;

  if (
    select count(*)
    from public.users
    where id = any(v_ids)
      and role = 'member'
  ) <> cardinality(v_ids) then
    raise exception 'Target list changed';
  end if;

  update public.users
  set
    role = p_role,
    session_version = session_version + 1
  where id = any(v_ids)
    and role = 'member';

  get diagnostics v_updated = row_count;

  if v_updated <> cardinality(v_ids) then
    raise exception 'Target list changed';
  end if;

  insert into public.audit_logs(actor_id, action, target_type, target_id)
  select p_actor, 'user.role.update', 'user', target_id
  from unnest(v_ids) as targets(target_id);

  return v_updated;
end;
$$;

drop function if exists public.set_user_role(uuid, public.user_role);
drop function if exists public.set_member_role(uuid, public.user_role);

revoke all on function public.update_event_metadata(
  uuid, uuid, text, timestamptz, timestamptz, text, integer, text, text
) from public;
revoke all on function public.set_user_role_atomic(uuid, uuid, public.user_role) from public;
revoke all on function public.set_members_role_atomic(uuid, uuid[], public.user_role) from public;

grant execute on function public.update_event_metadata(
  uuid, uuid, text, timestamptz, timestamptz, text, integer, text, text
) to service_role;
grant execute on function public.set_user_role_atomic(uuid, uuid, public.user_role) to service_role;
grant execute on function public.set_members_role_atomic(uuid, uuid[], public.user_role) to service_role;

notify pgrst, 'reload schema';

commit;
