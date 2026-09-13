\set ON_ERROR_STOP on

do $$
declare
  v_capacity integer;
  v_reserved integer;
  v_title text;
  v_audit_count integer;
begin
  select capacity, title
    into v_capacity, v_title
  from public.events
  where id = '11000000-0000-0000-0000-000000000001';

  select count(*)::integer
    into v_reserved
  from public.reservations
  where event_id = '11000000-0000-0000-0000-000000000001'
    and status = 'reserved';

  select count(*)::integer
    into v_audit_count
  from public.audit_logs
  where actor_id = '30000000-0000-0000-0000-000000000001'
    and action = 'event.update'
    and target_id = '11000000-0000-0000-0000-000000000001';

  if v_reserved > v_capacity then
    raise exception 'event update race violated capacity: reserved %, capacity %', v_reserved, v_capacity;
  end if;

  if v_capacity = 1 and (v_reserved <> 1 or v_title <> 'capacity update won' or v_audit_count <> 1) then
    raise exception 'event update winner left inconsistent state';
  end if;

  if v_capacity = 2 and (v_reserved <> 2 or v_title <> 'イベント更新競合テスト' or v_audit_count <> 0) then
    raise exception 'reservation winner left inconsistent state';
  end if;

  if v_capacity not in (1, 2) then
    raise exception 'event update race produced an unexpected capacity: %', v_capacity;
  end if;
end
$$;

select 'event update concurrency passed' as result;
