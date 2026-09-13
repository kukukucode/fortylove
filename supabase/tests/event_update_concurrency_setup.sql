\set ON_ERROR_STOP on

delete from public.events where id = '11000000-0000-0000-0000-000000000001';
delete from public.users where id in (
  '30000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001'
);

insert into public.users (id, name, password_hash, role)
values (
  '30000000-0000-0000-0000-000000000001',
  'イベント更新競合テスト管理者',
  'integration-test-hash',
  'admin'
);

insert into public.users (id, name, password_hash)
values
  ('31000000-0000-0000-0000-000000000001', 'イベント更新競合テスト予約者', 'integration-test-hash'),
  ('32000000-0000-0000-0000-000000000001', 'イベント更新競合テスト申込者', 'integration-test-hash');

insert into public.events (id, title, starts_at, ends_at, location, capacity, event_type)
values (
  '11000000-0000-0000-0000-000000000001',
  'イベント更新競合テスト',
  now() + interval '7 days',
  now() + interval '7 days 2 hours',
  'CI',
  2,
  'tennis'
);

select public.reserve_event(
  '31000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001'
);
