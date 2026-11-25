begin;
set local lock_timeout = '3s';

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
set local search_path = pg_catalog, public, extensions, pg_temp;

do $$
begin
  if exists (
    select 1 from pg_extension where extname = 'vector'
      and string_to_array(extversion, '.')::integer[] < array[0, 8, 0]
  ) then
    raise exception 'Indexed chatbot retrieval requires pgvector 0.8.0 or later';
  end if;
end;
$$;

-- Keep real[] as the import and versioning format. Invalid legacy embeddings
-- remain searchable by text and are omitted from the vector index.
create or replace function public.chatbot_search_vector(values_array real[])
returns vector language sql immutable strict parallel safe
set search_path = pg_catalog, public, extensions, pg_temp as $$
  select case when cardinality(values_array) = 768 and array_ndims(values_array) = 1
    and not exists (select 1 from unnest(values_array) item where item is null)
    and public.chatbot_embedding_norm(values_array) > 0
    and public.chatbot_embedding_norm(values_array) < 'Infinity'::double precision
    then values_array::vector(768) end;
$$;

create or replace function public.chatbot_bigrams(input text)
returns text[] language sql immutable strict parallel safe
set search_path = pg_catalog, pg_temp as $$
  select array(
    select distinct substr(input, offset_value, 2)
    from generate_series(1, greatest(length(input) - 1, 1)) offset_value
    where input <> ''
    order by 1
  );
$$;

create or replace function public.chatbot_index_bigrams(heading text, body text, keywords text[])
returns text[] language sql immutable strict parallel safe
set search_path = pg_catalog, pg_temp as $$
  select public.chatbot_bigrams(public.chatbot_normalize(heading))
    || public.chatbot_bigrams(public.chatbot_normalize(body))
    || array(
      select distinct left(word, 2)
      from unnest(public.chatbot_normalize_keywords(keywords)) word
      where length(word) >= 2
    );
$$;

alter table public.chatbot_knowledge
  add column if not exists search_title_bigrams text[] generated always as
    (public.chatbot_bigrams(public.chatbot_normalize(title))) stored,
  add column if not exists search_bigrams text[] generated always as
    (public.chatbot_index_bigrams(title, content, keywords)) stored,
  add column if not exists search_vector vector(768) generated always as
    (public.chatbot_search_vector(embedding)) stored;

alter table public.faqs
  add column if not exists search_title_bigrams text[] generated always as
    (public.chatbot_bigrams(public.chatbot_normalize(question))) stored,
  add column if not exists search_bigrams text[] generated always as
    (public.chatbot_index_bigrams(question, answer, array[]::text[])) stored,
  add column if not exists search_vector vector(768) generated always as
    (public.chatbot_search_vector(embedding)) stored;

create index if not exists chatbot_knowledge_search_bigrams_gin
  on public.chatbot_knowledge using gin (search_bigrams)
  where is_active and source_type = 'markdown';

create index if not exists faqs_search_bigrams_gin
  on public.faqs using gin (search_bigrams) where is_published;

create index if not exists chatbot_knowledge_search_vector_hnsw
  on public.chatbot_knowledge using hnsw (search_vector vector_cosine_ops)
  where is_active and source_type = 'markdown' and search_vector is not null;

create index if not exists faqs_search_vector_hnsw
  on public.faqs using hnsw (search_vector vector_cosine_ops)
  where is_published and search_vector is not null;

-- The app calls this RPC first with text, then only for semantic candidates if
-- needed. The existing hybrid RPC stays available during rollout and rollback.
create or replace function public.search_chatbot_candidates(
  p_sources text[], p_question text, p_query real[] default null, p_choice uuid default null
) returns jsonb language sql stable security definer
set search_path = pg_catalog, public, extensions, pg_temp
set hnsw.iterative_scan = strict_order
set hnsw.ef_search = 80 as $$
  with input as materialized (
    select public.chatbot_normalize(p_question) as question,
      public.chatbot_search_vector(p_query) as embedding
  ), terms as materialized (
    select question, public.chatbot_bigrams(question) as grams from input
    where p_query is null and p_choice is null
  ), lexical_pool as (
    select k.id, 'markdown'::text as kind, k.priority, k.updated_at,
      k.search_title, k.search_content, k.search_keywords, k.search_title_bigrams
    from terms t join public.chatbot_knowledge k on k.search_bigrams && t.grams
    where k.is_active and k.source_type = 'markdown' and k.source_name = any(p_sources)
    union all
    select f.id, 'faq', 100, f.updated_at,
      f.search_title, f.search_content, array[]::text[], f.search_title_bigrams
    from terms t join public.faqs f on f.search_bigrams && t.grams
    where f.is_published
  ), lexical_ranked as (
    select l.id, l.kind, l.priority, l.updated_at,
      case when l.search_title = t.question then 1.0 else least(0.95, greatest(
        case when words.hits > 0 then 0.42 else 0 end,
        1.3 * grams_overlap.hits / nullif(cardinality(l.search_title_bigrams) + cardinality(t.grams), 0)
          + least(words.hits, 2) * 0.2,
        case when length(t.question) > 1 and strpos(l.search_content, t.question) > 0 then 0.42 else 0 end
      )) end as score
    from lexical_pool l cross join terms t
    cross join lateral (
      select count(*) as hits from unnest(l.search_keywords) word
      where length(word) >= 2 and strpos(t.question, word) > 0
    ) words
    cross join lateral (
      select count(*) as hits from unnest(l.search_title_bigrams) gram where gram = any(t.grams)
    ) grams_overlap
  ), lexical as (
    select id, kind, score from lexical_ranked where score >= 0.38
    order by score desc, priority desc, updated_at desc, id, kind limit 20
  ), markdown_near as materialized (
    select k.* from input i cross join lateral (
      select k.id, k.priority, k.updated_at, k.search_vector <=> i.embedding as distance
      from public.chatbot_knowledge k
      where i.embedding is not null and p_choice is null
        and k.is_active and k.source_type = 'markdown'
        and k.source_name = any(p_sources) and k.search_vector is not null
      order by k.search_vector <=> i.embedding limit 60
    ) k
  ), markdown_semantic as (
    select * from markdown_near
    where exists (select 1 from markdown_near offset 19)
    union all
    -- A very selective source filter can exhaust the approximate scan early.
    -- Recheck only permitted rows so a sparse source still gets good coverage.
    select k.id, k.priority, k.updated_at, k.search_vector <=> i.embedding
    from input i cross join public.chatbot_knowledge k
    where i.embedding is not null and p_choice is null
      and k.is_active and k.source_type = 'markdown'
      and k.source_name = any(p_sources) and k.search_vector is not null
      and not exists (select 1 from markdown_near offset 19)
  ), faq_semantic as (
    select f.id, 100 as priority, f.updated_at, f.distance
    from input i cross join lateral (
      select f.id, f.updated_at, f.search_vector <=> i.embedding as distance
      from public.faqs f
      where i.embedding is not null and p_choice is null
        and f.is_published and f.search_vector is not null
      order by f.search_vector <=> i.embedding limit 60
    ) f
  ), all_semantic as (
    select id, 'markdown'::text as kind, priority, updated_at, distance from markdown_semantic
    union all
    select id, 'faq', priority, updated_at, distance from faq_semantic
  ), semantic as (
    select id, kind, 1.0 - distance as score from all_semantic
    where distance <= 0.32
    order by distance, priority desc, updated_at desc, id, kind limit 20
  ), candidates as (
    select id, kind, score::double precision as lexical_score, 0::double precision as semantic_score from lexical
    union all
    select id, kind, 0, score from semantic
    union all
    select k.id, 'markdown', 0, 0 from public.chatbot_knowledge k
    where k.id = p_choice and k.is_active and k.source_type = 'markdown' and k.source_name = any(p_sources)
    union all
    select f.id, 'faq', 0, 0 from public.faqs f where f.id = p_choice and f.is_published
  ), answers as (
    select k.id, k.title, k.content, k.category, k.keywords, k.priority, k.is_active, k.source_name,
      c.kind as source_kind, k.source_section, k.document_id, k.source_version, k.updated_at,
      c.lexical_score, c.semantic_score
    from candidates c join public.chatbot_knowledge k on c.kind = 'markdown' and k.id = c.id
    union all
    select f.id, f.question, f.answer, f.category, array[]::text[], 100, true, '公開FAQ',
      c.kind, null, null, null, f.updated_at, c.lexical_score, c.semantic_score
    from candidates c join public.faqs f on c.kind = 'faq' and f.id = c.id
  )
  select coalesce(jsonb_agg(to_jsonb(a) order by a.lexical_score desc, a.semantic_score desc,
    a.priority desc, a.updated_at desc, a.id, a.source_kind), '[]'::jsonb) from answers a;
$$;

revoke all on function public.search_chatbot_candidates(text[], text, real[], uuid),
  public.chatbot_search_vector(real[]), public.chatbot_bigrams(text), public.chatbot_index_bigrams(text, text, text[]) from public;

do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on function public.search_chatbot_candidates(text[], text, real[], uuid), public.chatbot_search_vector(real[]), public.chatbot_bigrams(text), public.chatbot_index_bigrams(text, text, text[]) from %I', api_role);
    end if;
  end loop;
end;
$$;

grant execute on function public.search_chatbot_candidates(text[], text, real[], uuid),
  public.chatbot_search_vector(real[]), public.chatbot_bigrams(text), public.chatbot_index_bigrams(text, text, text[]) to service_role;
grant usage on schema extensions to service_role;

notify pgrst, 'reload schema';
commit;
