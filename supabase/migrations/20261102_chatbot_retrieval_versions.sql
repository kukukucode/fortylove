begin;

-- Raw Markdown is private data, separate from the searchable chunks. Keeping both
-- in PostgreSQL makes publication/rollback atomic (no Storage/DB split commit).
create table if not exists public.chatbot_documents (
  id uuid primary key default gen_random_uuid(),
  source_name text not null unique,
  active_version integer not null default 0
);
create table if not exists public.chatbot_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.chatbot_documents(id) on delete cascade,
  version integer not null check(version > 0),
  markdown text not null check(octet_length(markdown) between 1 and 1000000),
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  embedding_model text not null,
  chunks jsonb not null check(jsonb_typeof(chunks) = 'array'),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(document_id, version)
);
alter table public.chatbot_documents enable row level security;
alter table public.chatbot_document_versions enable row level security;
revoke all on public.chatbot_documents, public.chatbot_document_versions from public;
revoke all on public.chatbot_documents, public.chatbot_document_versions from service_role;
grant select on public.chatbot_documents, public.chatbot_document_versions to service_role;
alter table public.chatbot_knowledge add column if not exists document_id uuid references public.chatbot_documents(id) on delete set null;
alter table public.chatbot_knowledge add column if not exists source_version integer;
insert into public.chatbot_documents(source_name)
  select distinct source_name from public.chatbot_knowledge where source_type='markdown' and source_name is not null
  on conflict(source_name) do nothing;
update public.chatbot_knowledge k set document_id=d.id from public.chatbot_documents d
  where k.source_name=d.source_name and k.source_type='markdown' and k.document_id is null;

create or replace function public.publish_chatbot_document(
  p_actor uuid, p_name text, p_markdown text, p_hash text, p_model text, p_rows jsonb,
  p_expected_version integer
) returns integer language plpgsql security definer set search_path = public as $$
declare v_document chatbot_documents; v_version integer;
begin
  if not exists(select 1 from users where id=p_actor and role='super_admin') then raise exception 'Forbidden'; end if;
  if p_markdown is null or octet_length(p_markdown) not between 1 and 1000000
    or p_model is distinct from 'gemini-embedding-001'
    or p_hash is distinct from encode(sha256(convert_to(p_markdown,'UTF8')),'hex') then raise exception 'Invalid original'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chatbot.source.' || p_name,0));
  insert into chatbot_documents(source_name) values(p_name) on conflict(source_name) do nothing;
  select * into v_document from chatbot_documents where source_name=p_name for update;
  if p_expected_version is distinct from v_document.active_version then raise exception 'Document changed; review again'; end if;
  v_version := v_document.active_version + 1;
  -- Existing import validation and all chunk writes run in this transaction.
  perform replace_chatbot_source(p_actor,p_name,p_hash,p_rows);
  insert into chatbot_document_versions(document_id,version,markdown,source_hash,embedding_model,chunks,created_by)
    values(v_document.id,v_version,p_markdown,p_hash,p_model,p_rows,p_actor);
  update chatbot_documents set active_version=v_version where id=v_document.id;
  update chatbot_knowledge set document_id=v_document.id,source_version=v_version
    where source_type='markdown' and source_name=p_name;
  return v_version;
end $$;

create or replace function public.restore_chatbot_document(p_actor uuid,p_version_id uuid,p_expected_version integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v chatbot_document_versions; v_name text; v_result integer;
begin
  if not exists(select 1 from users where id=p_actor and role='super_admin') then raise exception 'Forbidden'; end if;
  select * into v from chatbot_document_versions where id=p_version_id;
  if not found then raise exception 'Version not found'; end if;
  select source_name into v_name from chatbot_documents where id=v.document_id;
  v_result := publish_chatbot_document(p_actor,v_name,v.markdown,v.source_hash,v.embedding_model,v.chunks,p_expected_version);
  insert into audit_logs(actor_id,action,target_type,target_id)
    values(p_actor,'chatbot.knowledge.restore','chatbot_document_versions',p_version_id);
  return v_result;
end $$;

create or replace function public.delete_chatbot_document(p_actor uuid,p_name text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from users where id=p_actor and role='super_admin') then raise exception 'Forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chatbot.source.' || p_name,0));
  delete from chatbot_knowledge where source_type='markdown' and source_name=p_name;
  delete from chatbot_documents where source_name=p_name;
  update app_settings set chatbot_admin_sources=array_remove(chatbot_admin_sources,p_name),
    chatbot_member_sources=array_remove(chatbot_member_sources,p_name) where id=1;
  insert into audit_logs(actor_id,action,target_type) values(p_actor,'chatbot.knowledge.delete_markdown','chatbot_documents');
end $$;

-- Japanese titles require character n-grams rather than English word stemming.
create or replace function public.chatbot_normalize(p_text text) returns text
language sql immutable parallel safe set search_path=public as $$
  select regexp_replace(lower(normalize(coalesce(p_text,''),NFKC)),'[[:space:][:punct:]]','','g');
$$;
create or replace function public.chatbot_dice(p_left text,p_right text) returns double precision
language sql immutable parallel safe set search_path=public as $$
  with a as (select distinct substr(p_left,i,2) s from generate_series(1,greatest(length(p_left)-1,1)) i where p_left<>''),
  b as (select distinct substr(p_right,i,2) s from generate_series(1,greatest(length(p_right)-1,1)) i where p_right<>'')
  select coalesce(2.0*(select count(*) from a join b using(s))/nullif((select count(*) from a)+(select count(*) from b),0),0)::double precision;
$$;

-- Bounded candidate retrieval; no full corpus or full vectors leave the DB.
-- Two independent top-20 lists are fused in the application with RRF.
create or replace function public.search_chatbot_knowledge(
  p_sources text[], p_question text, p_query real[] default null, p_choice uuid default null
) returns jsonb language sql stable security definer set search_path=public as $$
  with query_text as materialized (
    select chatbot_normalize(p_question) q,
      (select sqrt(sum(v::double precision*v)) from unnest(p_query) v) query_norm
  ), permitted as materialized (
    select k.id,k.title,k.content,k.category,k.keywords,k.priority,k.is_active,k.source_name,
      'markdown'::text source_kind,k.source_section,k.document_id,k.source_version,k.updated_at,k.embedding
    from chatbot_knowledge k where k.source_type='markdown' and k.is_active and k.source_name=any(p_sources)
    union all
    select f.id,f.question,f.answer,f.category,array[]::text[],100,true,'公開FAQ','faq',null,null,null,f.updated_at,f.embedding
    from faqs f where f.is_published
  ), scored as materialized (
    select p.*, case when chatbot_normalize(title)=q then 1.0
      else least(0.95,greatest(case when hits.n>0 then 0.42 else 0 end,
        chatbot_dice(chatbot_normalize(title),q)*0.65+least(hits.n,2)*0.2,
        case when length(q)>1 and strpos(chatbot_normalize(content),q)>0 then 0.42 else 0 end)) end as lexical_score,
      case when cardinality(embedding)=768 and cardinality(p_query)=768 then
        (select sum(v::double precision*qv) / nullif(sqrt(sum(v::double precision*v))*query_norm,0)
         from unnest(embedding,p_query) e(v,qv)) else 0 end as semantic_score
    from permitted p cross join query_text cross join lateral (
      select count(*) n from unnest(p.keywords) w where length(chatbot_normalize(w))>=2 and strpos(q,chatbot_normalize(w))>0
    ) hits where p_choice is null or p.id=p_choice
  ), lexical as (select id from scored where lexical_score>=0.38 order by lexical_score desc,priority desc,updated_at desc,id limit 20),
  semantic as (select id from scored where semantic_score>=0.68 order by semantic_score desc,priority desc,updated_at desc,id limit 20),
  chosen as (select id from lexical union select id from semantic union select id from scored where id=p_choice)
  select coalesce(jsonb_agg(to_jsonb(s)-'embedding'),'[]'::jsonb) from scored s join chosen c using(id);
$$;

-- Legacy semantic endpoint also excludes disabled chunks.
create or replace function public.chatbot_semantic_matches(p_sources text[],p_query real[])
returns table(id uuid,similarity double precision) language sql stable security definer set search_path=public as $$
  select (r->>'id')::uuid,(r->>'semantic_score')::double precision
  from jsonb_array_elements(search_chatbot_knowledge(p_sources,'',p_query)) r
  where (r->>'semantic_score')::double precision>=0.68 order by 2 desc limit 20;
$$;
revoke all on function public.publish_chatbot_document(uuid,text,text,text,text,jsonb,integer),
  public.restore_chatbot_document(uuid,uuid,integer),public.delete_chatbot_document(uuid,text),
  public.search_chatbot_knowledge(text[],text,real[],uuid),public.chatbot_normalize(text),public.chatbot_dice(text,text) from public;
grant execute on function public.publish_chatbot_document(uuid,text,text,text,text,jsonb,integer),
  public.restore_chatbot_document(uuid,uuid,integer),public.delete_chatbot_document(uuid,text),
  public.search_chatbot_knowledge(text[],text,real[],uuid) to service_role;
-- Supabase may grant anon/authenticated privileges via default ACLs.
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke all on public.chatbot_documents,public.chatbot_document_versions from %I',r);
      execute format('revoke all on function public.publish_chatbot_document(uuid,text,text,text,text,jsonb,integer),public.restore_chatbot_document(uuid,uuid,integer),public.delete_chatbot_document(uuid,text),public.search_chatbot_knowledge(text[],text,real[],uuid),public.chatbot_semantic_matches(text[],real[]),public.chatbot_normalize(text),public.chatbot_dice(text,text) from %I',r);
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
