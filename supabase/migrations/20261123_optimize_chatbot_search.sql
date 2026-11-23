begin;

create or replace function public.chatbot_normalize_keywords(p_keywords text[])
returns text[] language sql immutable strict parallel safe set search_path=public as $$
  select array(select chatbot_normalize(w) from unnest(p_keywords) w);
$$;

create or replace function public.chatbot_embedding_norm(p_embedding real[])
returns double precision language sql immutable strict parallel safe set search_path=public as $$
  select sqrt(sum(v::double precision*v)) from unnest(p_embedding) v;
$$;

-- PostgreSQL populates existing rows and keeps these values current on writes.
alter table public.chatbot_knowledge
  add column if not exists search_title text generated always as (public.chatbot_normalize(title)) stored,
  add column if not exists search_content text generated always as (public.chatbot_normalize(content)) stored,
  add column if not exists search_keywords text[] generated always as (public.chatbot_normalize_keywords(keywords)) stored,
  add column if not exists search_norm double precision generated always as (public.chatbot_embedding_norm(embedding)) stored;

alter table public.faqs
  add column if not exists search_title text generated always as (public.chatbot_normalize(question)) stored,
  add column if not exists search_content text generated always as (public.chatbot_normalize(answer)) stored,
  add column if not exists search_norm double precision generated always as (public.chatbot_embedding_norm(embedding)) stored;

create or replace function public.search_chatbot_knowledge(
  p_sources text[], p_question text, p_query real[] default null, p_choice uuid default null
) returns jsonb language sql stable security definer set search_path=public as $$
  with query_input as materialized (
    select chatbot_normalize(p_question) q, chatbot_embedding_norm(p_query) query_norm
  ), permitted as not materialized (
    select id, 'markdown'::text source_kind, priority, updated_at,
      search_title, search_content, search_keywords, search_norm, embedding
    from chatbot_knowledge
    where source_type='markdown' and is_active and source_name=any(p_sources)
      and (p_choice is null or id=p_choice)
    union all
    select id, 'faq', 100, updated_at, search_title, search_content,
      array[]::text[], search_norm, embedding
    from faqs where is_published and (p_choice is null or id=p_choice)
  ), scored as materialized (
    -- Keep only identifiers and scores in the result shared by both rankings.
    select p.id,p.source_kind,p.priority,p.updated_at,
      case when p.search_title=q then 1.0
        else least(0.95,greatest(case when hits.n>0 then 0.42 else 0 end,
          chatbot_dice(p.search_title,q)*0.65+least(hits.n,2)*0.2,
          case when length(q)>1 and strpos(p.search_content,q)>0 then 0.42 else 0 end))
      end as lexical_score,
      case when cardinality(p.embedding)=768 and cardinality(p_query)=768 then
        (select sum(v::double precision*qv) / nullif(p.search_norm*query_norm,0)
         from unnest(p.embedding,p_query) e(v,qv)) else 0 end as semantic_score
    from permitted p cross join query_input cross join lateral (
      select count(*) n from unnest(p.search_keywords) w where length(w)>=2 and strpos(q,w)>0
    ) hits
  ), lexical as (
    select id,source_kind from scored where lexical_score>=0.38
    order by lexical_score desc,priority desc,updated_at desc,id,source_kind limit 20
  ), semantic as (
    select id,source_kind from scored where semantic_score>=0.68
    order by semantic_score desc,priority desc,updated_at desc,id,source_kind limit 20
  ), chosen as (
    select id,source_kind from lexical
    union select id,source_kind from semantic
    union select id,source_kind from scored where id=p_choice
  ), candidates as materialized (
    select s.id,s.source_kind,s.lexical_score,s.semantic_score
    from scored s join chosen c using(id,source_kind)
  ), answers as (
    select k.id,k.title,k.content,k.category,k.keywords,k.priority,k.is_active,k.source_name,
      c.source_kind,k.source_section,k.document_id,k.source_version,k.updated_at,c.lexical_score,c.semantic_score
    from candidates c join chatbot_knowledge k on c.source_kind='markdown' and k.id=c.id
    union all
    select f.id,f.question,f.answer,f.category,array[]::text[],100,true,'公開FAQ',
      c.source_kind,null,null,null,f.updated_at,c.lexical_score,c.semantic_score
    from candidates c join faqs f on c.source_kind='faq' and f.id=c.id
  )
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from answers a;
$$;

revoke all on function public.chatbot_normalize_keywords(text[]),public.chatbot_embedding_norm(real[]) from public;
-- Supabase default ACLs can grant execution to API roles directly.
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke all on function public.chatbot_normalize_keywords(text[]),public.chatbot_embedding_norm(real[]) from %I',r);
    end if;
  end loop;
end $$;
-- Generated expressions also run for authorized direct FAQ edits and imports.
grant execute on function public.chatbot_normalize(text),public.chatbot_normalize_keywords(text[]),public.chatbot_embedding_norm(real[]) to service_role;

notify pgrst,'reload schema';
commit;
