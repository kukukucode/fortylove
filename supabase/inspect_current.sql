-- 実際のSupabase状態を変更せずに確認する棚卸しSQL。
-- Supabase SQL Editorで実行すると、すべての確認項目が1つの結果表に表示される。
begin transaction read only;

with
required_tables(phase, object_name) as (
  values
    ('PRECONDITION', 'users'),
    ('PRECONDITION', 'events'),
    ('PRECONDITION', 'event_documents'),
    ('PRECONDITION', 'reservations'),
    ('PRECONDITION', 'membership_withdrawals'),
    ('PRECONDITION', 'app_settings'),
    ('PRECONDITION', 'audit_logs'),
    ('UPGRADE_TARGET', 'chatbot_knowledge'),
    ('UPGRADE_TARGET', 'chatbot_daily_usage'),
    ('UPGRADE_TARGET', 'login_rate_limits'),
    ('UPGRADE_TARGET', 'app_schema_migrations')
),
required_columns(phase, table_name, column_name) as (
  values
    ('PRECONDITION', 'users', 'id'),
    ('PRECONDITION', 'users', 'name'),
    ('PRECONDITION', 'users', 'password_hash'),
    ('PRECONDITION', 'users', 'university'),
    ('PRECONDITION', 'users', 'faculty'),
    ('PRECONDITION', 'users', 'department'),
    ('PRECONDITION', 'users', 'grade'),
    ('PRECONDITION', 'users', 'instagram_id'),
    ('PRECONDITION', 'users', 'line_display_name'),
    ('PRECONDITION', 'users', 'tennis_experience'),
    ('PRECONDITION', 'users', 'has_racket'),
    ('PRECONDITION', 'users', 'role'),
    ('PRECONDITION', 'events', 'id'),
    ('PRECONDITION', 'events', 'title'),
    ('PRECONDITION', 'events', 'starts_at'),
    ('PRECONDITION', 'events', 'ends_at'),
    ('PRECONDITION', 'events', 'location'),
    ('PRECONDITION', 'events', 'capacity'),
    ('PRECONDITION', 'event_documents', 'event_id'),
    ('PRECONDITION', 'event_documents', 'file_path'),
    ('PRECONDITION', 'event_documents', 'file_name'),
    ('PRECONDITION', 'event_documents', 'updated_by'),
    ('PRECONDITION', 'reservations', 'id'),
    ('PRECONDITION', 'reservations', 'user_id'),
    ('PRECONDITION', 'reservations', 'event_id'),
    ('PRECONDITION', 'reservations', 'status'),
    ('PRECONDITION', 'membership_withdrawals', 'former_user_id'),
    ('PRECONDITION', 'membership_withdrawals', 'reservation_history'),
    ('PRECONDITION', 'membership_withdrawals', 'withdrawal_source'),
    ('PRECONDITION', 'membership_withdrawals', 'withdrawn_by'),
    ('PRECONDITION', 'app_settings', 'id'),
    ('PRECONDITION', 'app_settings', 'recruiting_open'),
    ('PRECONDITION', 'audit_logs', 'actor_id'),
    ('PRECONDITION', 'audit_logs', 'action'),
    ('PRECONDITION', 'audit_logs', 'target_type'),
    ('PRECONDITION', 'audit_logs', 'target_id'),
    ('UPGRADE_TARGET', 'users', 'session_version'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_enabled'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_faq_enabled'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_event_enabled'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_fallback_message'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_admin_enabled'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_member_enabled'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_admin_sources'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_member_sources'),
    ('UPGRADE_TARGET', 'app_settings', 'chatbot_escalation_email')
),
required_enum_values(enum_name, enum_label) as (
  values
    ('user_role', 'super_admin'),
    ('user_role', 'admin'),
    ('user_role', 'member'),
    ('reservation_status', 'reserved'),
    ('reservation_status', 'cancelled'),
    ('reservation_status', 'attended')
),
required_functions(function_name) as (
  values
    ('consume_chatbot_message'),
    ('check_login_rate_limit'),
    ('record_login_failure'),
    ('clear_login_rate_limit'),
    ('consume_request_rate_limit'),
    ('reserve_event'),
    ('archive_and_delete_member'),
    ('cancel_event_reservation'),
    ('update_event_metadata'),
    ('set_user_role_atomic'),
    ('set_members_role_atomic'),
    ('replace_user_password'),
    ('promote_member_grades')
),
required_indexes(index_name) as (
  values
    ('event_documents_file_path_key'),
    ('chatbot_knowledge_active_priority_idx'),
    ('chatbot_knowledge_source_section_unique')
),
checks as (
  select
    t.phase,
    'TABLE'::text as object_type,
    'public.' || t.object_name as object_name,
    to_regclass('public.' || t.object_name) is not null as ready
  from required_tables t

  union all

  select
    c.phase,
    'COLUMN',
    'public.' || c.table_name || '.' || c.column_name,
    exists (
      select 1
      from information_schema.columns actual
      where actual.table_schema = 'public'
        and actual.table_name = c.table_name
        and actual.column_name = c.column_name
    )
  from required_columns c

  union all

  select
    'PRECONDITION',
    'ENUM_VALUE',
    'public.' || required.enum_name || '.' || required.enum_label,
    exists (
      select 1
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = required.enum_name
        and e.enumlabel = required.enum_label
    )
  from required_enum_values required

  union all

  select
    'UPGRADE_TARGET',
    'FUNCTION',
    'public.' || required.function_name,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = required.function_name
    )
  from required_functions required

  union all

  select
    'UPGRADE_TARGET',
    'INDEX',
    'public.' || required.index_name,
    exists (
      select 1
      from pg_indexes actual
      where actual.schemaname = 'public'
        and actual.indexname = required.index_name
    )
  from required_indexes required
),
report as (
  select
    0 as display_order,
    'SUMMARY'::text as phase,
    'DATABASE'::text as object_type,
    current_database() as object_name,
    case
      when bool_and(ready) filter (where phase = 'PRECONDITION') then 'READY'
      else 'BLOCKED'
    end as status,
    case
      when bool_and(ready) filter (where phase = 'PRECONDITION')
        then '統合アップグレードの前提を満たしています'
      else 'PRECONDITIONのMISSINGを先に確認してください'
    end as note
  from checks

  union all

  select
    case when phase = 'PRECONDITION' then 1 else 2 end,
    phase,
    object_type,
    object_name,
    case when ready then 'OK' else 'MISSING' end,
    case
      when phase = 'UPGRADE_TARGET' and not ready then '統合アップグレードで追加予定'
      when phase = 'UPGRADE_TARGET' then 'すでに適用済み'
      when not ready then 'アップグレード前に要確認'
      else '前提確認済み'
    end
  from checks
)
select phase, object_type, object_name, status, note
from report
order by
  display_order,
  case status when 'BLOCKED' then 0 when 'MISSING' then 1 else 2 end,
  object_type,
  object_name;

commit;
