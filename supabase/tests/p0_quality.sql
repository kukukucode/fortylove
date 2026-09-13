\set ON_ERROR_STOP on

begin;

do $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_event uuid;
  v_result text;
begin
  insert into users (name, password_hash) values ('P0 member A', 'integration-test-hash') returning id into v_member_a;
  insert into users (name, password_hash) values ('P0 member B', 'integration-test-hash') returning id into v_member_b;
  insert into events (title, starts_at, ends_at, location, capacity)
    values ('P0 capacity', now() + interval '1 day', now() + interval '1 day 1 hour', 'court', 1)
    returning id into v_event;

  if reserve_event(v_member_a, v_event) <> 'reserved' then raise exception 'first reservation failed'; end if;
  if reserve_event(v_member_b, v_event) <> 'full' then raise exception 'capacity was exceeded'; end if;
  if (select count(*) from reservations where event_id = v_event and status = 'reserved') <> 1 then
    raise exception 'reservation count differs from capacity';
  end if;

  v_result := cancel_event_reservation(v_member_a, v_event);
  if v_result <> 'cancelled' then raise exception 'valid cancellation failed: %', v_result; end if;
end;
$$;

do $$
declare
  v_actor uuid;
  v_member uuid;
begin
  insert into users (name, password_hash, role) values ('P0 actor', 'integration-test-hash', 'super_admin') returning id into v_actor;
  insert into users (name, password_hash) values ('P0 withdrawal', 'integration-test-hash') returning id into v_member;

  if archive_and_delete_member(v_member, v_actor, 'admin') <> 'deleted' then raise exception 'atomic withdrawal failed'; end if;
  if exists (select 1 from users where id = v_member) then raise exception 'withdrawn user remains'; end if;
  if not exists (select 1 from membership_withdrawals where former_user_id = v_member) then raise exception 'withdrawal archive is missing'; end if;
  if not exists (select 1 from audit_logs where action = 'account.delete.admin' and target_id = v_member) then raise exception 'withdrawal audit is missing'; end if;
end;
$$;

do $$
declare
  v_member uuid;
  v_first jsonb;
  v_second jsonb;
begin
  insert into users (name, password_hash, grade) values ('P0 promotion', 'integration-test-hash', 1) returning id into v_member;
  v_first := promote_member_grades(2999);
  v_second := promote_member_grades(2999);
  if (v_first->>'skipped')::boolean then raise exception 'first promotion was skipped'; end if;
  if not (v_second->>'skipped')::boolean then raise exception 'second promotion was not idempotent'; end if;
  if (select grade from users where id = v_member) <> 2 then raise exception 'member was promoted more than once'; end if;
end;
$$;

do $$
declare
  v_key text := repeat('a', 64);
  v_wait integer;
begin
  perform clear_login_rate_limit(v_key);
  perform record_login_failure(v_key, 600, 5, 600) from generate_series(1, 4);
  if coalesce(check_login_rate_limit(v_key), 0) <> 0 then raise exception 'login blocked too early'; end if;
  v_wait := record_login_failure(v_key, 600, 5, 600);
  if v_wait <= 0 then raise exception 'login was not blocked at threshold'; end if;
  perform clear_login_rate_limit(v_key);
  if coalesce(check_login_rate_limit(v_key), 0) <> 0 then raise exception 'login limit was not cleared'; end if;
end;
$$;

do $$
declare
  v_key text := repeat('b', 64);
begin
  perform clear_login_rate_limit(v_key);
  if not consume_request_rate_limit(v_key, 3600, 5, 3600) then raise exception 'first registration request was blocked'; end if;
  perform consume_request_rate_limit(v_key, 3600, 5, 3600) from generate_series(1, 4);
  if consume_request_rate_limit(v_key, 3600, 5, 3600) then raise exception 'registration limit was not enforced'; end if;
end;
$$;

do $$
declare
  v_actor uuid;
  v_user uuid;
begin
  insert into users (name, password_hash, role) values ('P0 role actor', 'integration-test-hash', 'super_admin') returning id into v_actor;
  insert into users (name, password_hash) values ('P1 session', 'integration-test-hash') returning id into v_user;
  if not set_user_role_atomic(v_actor, v_user, 'admin') then raise exception 'role update failed'; end if;
  if (select session_version from users where id = v_user) <> 2 then raise exception 'role update did not invalidate sessions'; end if;
  if not exists (
    select 1 from audit_logs
    where actor_id = v_actor and action = 'user.role.update' and target_id = v_user
  ) then raise exception 'role update audit is missing'; end if;
  if not replace_user_password(v_user, 'integration-test-replacement-hash') then raise exception 'password update failed'; end if;
  if (select session_version from users where id = v_user) <> 3 then raise exception 'password update did not invalidate sessions'; end if;
end;
$$;

do $$
declare
  v_actor uuid;
  v_member_a uuid;
  v_member_b uuid;
  v_audit_before integer;
begin
  insert into users (name, password_hash, role) values ('P0 bulk actor', 'integration-test-hash', 'super_admin') returning id into v_actor;
  insert into users (name, password_hash) values ('P0 bulk member A', 'integration-test-hash') returning id into v_member_a;
  insert into users (name, password_hash, role) values ('P0 bulk member B', 'integration-test-hash', 'admin') returning id into v_member_b;
  select count(*)::integer into v_audit_before from audit_logs where actor_id = v_actor and action = 'user.role.update';

  begin
    perform set_members_role_atomic(v_actor, array[v_member_a, v_member_b], 'super_admin');
    raise exception 'mixed bulk role update unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'mixed bulk role update unexpectedly succeeded' then raise; end if;
  end;

  if (select role from users where id = v_member_a) <> 'member' then raise exception 'bulk role update partially committed'; end if;
  if (select session_version from users where id = v_member_a) <> 1 then raise exception 'partial role update invalidated a session'; end if;
  if (select count(*) from audit_logs where actor_id = v_actor and action = 'user.role.update') <> v_audit_before then
    raise exception 'failed bulk role update wrote audit rows';
  end if;

  update users set role = 'member' where id = v_member_b;
  if set_members_role_atomic(v_actor, array[v_member_a, v_member_b], 'super_admin') <> 2 then
    raise exception 'valid bulk role update returned an unexpected count';
  end if;
  if (select count(*) from users where id in (v_member_a, v_member_b) and role = 'super_admin' and session_version = 2) <> 2 then
    raise exception 'valid bulk role update did not update every target';
  end if;
  if (select count(*) from audit_logs where actor_id = v_actor and action = 'user.role.update' and target_id in (v_member_a, v_member_b)) <> 2 then
    raise exception 'bulk role audit count differs from update count';
  end if;
end;
$$;

do $$
declare
  v_actor uuid;
  v_member_a uuid;
  v_member_b uuid;
  v_event uuid;
begin
  insert into users (name, password_hash, role) values ('P0 event actor', 'integration-test-hash', 'admin') returning id into v_actor;
  insert into users (name, password_hash) values ('P0 event member A', 'integration-test-hash') returning id into v_member_a;
  insert into users (name, password_hash) values ('P0 event member B', 'integration-test-hash') returning id into v_member_b;
  insert into events (title, starts_at, ends_at, location, capacity)
    values ('P0 event before', now() + interval '2 days', now() + interval '2 days 1 hour', 'court', 2)
    returning id into v_event;
  if reserve_event(v_member_a, v_event) <> 'reserved' then raise exception 'first event update fixture reservation failed'; end if;
  if reserve_event(v_member_b, v_event) <> 'reserved' then raise exception 'second event update fixture reservation failed'; end if;

  if update_event_metadata(
    v_actor, v_event, 'P0 capacity rejected', now() + interval '2 days', now() + interval '2 days 1 hour',
    'court', 1, '', 'tennis'
  ) <> 'capacity' then raise exception 'event capacity was reduced below reserved count'; end if;
  if (select title from events where id = v_event) <> 'P0 event before' then
    raise exception 'rejected event update partially committed';
  end if;

  if update_event_metadata(
    v_actor, v_event, 'P0 event after', now() + interval '2 days', now() + interval '2 days 1 hour',
    'court 2', 2, 'updated', 'event'
  ) <> 'updated' then raise exception 'valid event update failed'; end if;
  if not exists (
    select 1 from events
    where id = v_event and title = 'P0 event after' and capacity = 2 and event_type = 'event'
  ) then raise exception 'event metadata was not updated'; end if;
  if not exists (
    select 1 from audit_logs
    where actor_id = v_actor and action = 'event.update' and target_id = v_event
  ) then raise exception 'event update audit is missing'; end if;

  if to_regprocedure('public.set_user_role(uuid,public.user_role)') is not null
     or to_regprocedure('public.set_member_role(uuid,public.user_role)') is not null then
    raise exception 'legacy unaudited role RPC remains available';
  end if;
end;
$$;

do $$
declare
  v_actor uuid;
  v_event_a uuid;
  v_event_b uuid;
  v_path text := 'events/shared/document.pdf';
begin
  insert into users (name, password_hash, role) values ('P1 document actor', 'integration-test-hash', 'admin') returning id into v_actor;
  insert into events (title, starts_at, ends_at, location, capacity)
    values ('P1 document A', now() + interval '1 day', now() + interval '1 day 1 hour', 'court', 10)
    returning id into v_event_a;
  insert into events (title, starts_at, ends_at, location, capacity)
    values ('P1 document B', now() + interval '2 days', now() + interval '2 days 1 hour', 'court', 10)
    returning id into v_event_b;
  insert into event_documents (event_id, file_path, file_name, updated_by)
    values (v_event_a, v_path, 'a.pdf', v_actor);
  begin
    insert into event_documents (event_id, file_path, file_name, updated_by)
      values (v_event_b, v_path, 'b.pdf', v_actor);
    raise exception 'duplicate event document path was accepted';
  exception when unique_violation then
    null;
  end;
end;
$$;

rollback;
