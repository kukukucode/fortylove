-- Supabase SQL Editorでアップグレード後に実行する読み取り専用確認SQL。
begin transaction read only;

select
  to_regclass('public.chatbot_knowledge') is not null as chatbot_knowledge_ready,
  to_regclass('public.chatbot_daily_usage') is not null as chatbot_daily_usage_ready,
  to_regclass('public.login_rate_limits') is not null as rate_limits_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'session_version'
  ) as session_version_ready,
  to_regprocedure('public.reserve_event(uuid,uuid)') is not null as reservation_rpc_ready,
  to_regprocedure('public.update_event_metadata(uuid,uuid,text,timestamp with time zone,timestamp with time zone,text,integer,text,text)') is not null as event_update_rpc_ready,
  to_regprocedure('public.set_user_role_atomic(uuid,uuid,public.user_role)') is not null as role_update_rpc_ready,
  to_regprocedure('public.set_members_role_atomic(uuid,uuid[],public.user_role)') is not null as bulk_role_update_rpc_ready,
  to_regprocedure('public.set_user_role(uuid,public.user_role)') is null as legacy_role_update_removed,
  to_regprocedure('public.set_member_role(uuid,public.user_role)') is null as legacy_member_role_update_removed,
  to_regprocedure('public.archive_and_delete_member(uuid,uuid,text)') is not null as withdrawal_rpc_ready,
  to_regprocedure('public.promote_member_grades(integer)') is not null as grade_cron_rpc_ready,
  to_regprocedure('public.consume_request_rate_limit(text,integer,integer,integer)') is not null as registration_limit_ready,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'event_documents_file_path_key'
  ) as document_path_unique_ready,
  exists (
    select 1 from storage.buckets
    where id = 'event-documents'
      and public = false
      and file_size_limit = 15728640
      and allowed_mime_types @> array['application/pdf']
  ) as document_bucket_ready;

select file_path, count(*) as references
from public.event_documents
group by file_path
having count(*) > 1;

select
  version,
  applied_at
from public.app_schema_migrations
where version = '20260905_consolidated_upgrade';

commit;
