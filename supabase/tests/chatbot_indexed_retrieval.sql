begin;
set local search_path = pg_catalog, public, extensions, pg_temp;

-- Synthetic fixtures distinguish exact answers, partial matches, and rows
-- with stronger embeddings that the current audience must never receive.
insert into public.chatbot_knowledge
  (id, title, content, category, keywords, source_type, source_name, is_active, embedding)
select md5('indexed-retrieval-' || fixture)::uuid, title, content, '検索テスト', keywords,
  'markdown', source_name, active, embedding
from (
  values
    ('fee', '入会費はいくらですか', '入会費は5000円です。', array['入会費'], 'indexed-member.md', true,
      array_fill(0.1::real, array[768])),
    ('loan', '貸出について', '集合時にお貸しできます。', array['ラケット', '貸し出し'], 'indexed-member.md', true,
      array_fill(0.06::real, array[700]) || array_fill((-0.03)::real, array[68])),
    ('content', '確認事項', 'シューズを準備してください。', array['持ち物'], 'indexed-member.md', true, null),
    ('single', '靴？', '運動靴で参加できます。', array['靴'], 'indexed-member.md', true,
      array_fill(0::real, array[768])),
    ('private', '管理専用の費用', '非公開の会計資料です。', array['入会費'], 'indexed-admin.md', true,
      array_fill(0.1::real, array[768])),
    ('inactive', '過去の入会費', '旧資料です。', array['入会費'], 'indexed-member.md', false,
      array_fill(0.1::real, array[768]))
) fixtures(fixture, title, content, keywords, source_name, active, embedding);

insert into public.chatbot_knowledge
  (id, title, content, category, keywords, source_type, source_name, embedding)
select md5('indexed-private-decoy-' || item)::uuid, '非公開の会計 ' || item,
  '許可されていない資料です。', '検索テスト', array['入会費'], 'markdown', 'indexed-admin.md',
  array_fill(0.1::real, array[768])
from generate_series(1, 85) item;

insert into public.faqs(id, question, answer, category, is_published, embedding)
values
  (md5('indexed-faq')::uuid, '入会費はいくらですか', '公式の入会費です。', '検索テスト', true,
    array_fill(0.1::real, array[768])),
  (md5('indexed-draft')::uuid, '非公開の入会費', '公開前の案内です。', '検索テスト', false,
    array_fill(0.1::real, array[768]));

do $$
declare
  sources text[] := array['indexed-member.md'];
  vector_input real[] := array_fill(0.1::real, array[768]);
  question text;
  results jsonb;
begin
  foreach question in array array['入会費はいくらですか？', 'ラケットの貸し出し', 'シューズ', '靴', '無関係な質問']
  loop
    if (
      select array_agg(e->>'id' order by e->>'id')
      from jsonb_array_elements(public.search_chatbot_candidates(sources, question)) e
    ) is distinct from (
      select array_agg(e->>'id' order by e->>'id')
      from jsonb_array_elements(public.search_chatbot_knowledge(sources, question)) e
    ) then raise exception 'Indexed lexical results differ for %', question;
    end if;
  end loop;

  results := public.search_chatbot_candidates(sources, '', vector_input);
  if jsonb_array_length(results) <> 3 or not exists (
    select from jsonb_array_elements(results) e
    where e->>'id' = md5('indexed-retrieval-loan')::uuid::text and (e->>'semantic_score')::numeric > 0.88
  ) then raise exception 'Unexpected scoped semantic results: %', results;
  end if;
  if exists (
    select from jsonb_array_elements(results) e
    where (e->>'lexical_score')::numeric <> 0 or e->>'source_name' = 'indexed-admin.md' or e->>'id' in (
      md5('indexed-retrieval-private')::uuid::text,
      md5('indexed-retrieval-inactive')::uuid::text,
      md5('indexed-draft')::uuid::text
    )
  ) then raise exception 'Semantic RPC included lexical scores or leaked unpermitted records';
  end if;
  if jsonb_array_length(public.search_chatbot_candidates(array[]::text[], '', vector_input)) <> 1
    or public.search_chatbot_candidates(sources, '', array[1::real]) <> '[]'::jsonb
    or public.search_chatbot_candidates(sources, '', null, md5('indexed-retrieval-private')::uuid) <> '[]'::jsonb
    or public.search_chatbot_candidates(sources, '', null, md5('indexed-draft')::uuid) <> '[]'::jsonb
    or jsonb_array_length(public.search_chatbot_candidates(sources, '', null, md5('indexed-retrieval-content')::uuid)) <> 1
  then raise exception 'Empty scope, bad embedding, or choice handling changed';
  end if;

  update public.chatbot_knowledge set embedding = array_fill('NaN'::real, array[768])
    where id = md5('indexed-retrieval-loan')::uuid;
  if jsonb_array_length(public.search_chatbot_candidates(sources, '', vector_input)) <> 2
    or jsonb_array_length(public.search_chatbot_candidates(sources, 'ラケット')) <> 1
  then raise exception 'Invalid embedding should remove only the vector candidate';
  end if;
  if has_function_privilege('public', 'public.search_chatbot_candidates(text[],text,real[],uuid)', 'execute')
    or has_function_privilege('public', 'public.chatbot_nearest_candidates(text[],vector)', 'execute')
  then
    raise exception 'Public access to indexed retrieval RPC';
  end if;
  if (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
        join pg_am a on a.oid = c.relam where i.indisvalid and a.amname = 'hnsw'
        and c.relname in ('chatbot_knowledge_search_vector_hnsw', 'faqs_search_vector_hnsw')) <> 2
  then raise exception 'Missing HNSW index';
  end if;
end;
$$;

-- Mirror the production service role inside this rolled-back test transaction.
alter role service_role bypassrls;
grant select, update on public.faqs to service_role;
set local role service_role;
update public.faqs set answer = '公式の新しい回答です。', embedding = array_fill(0.15::real, array[768])
where id = md5('indexed-faq')::uuid;
reset role;

do $$
begin
  if not exists (
    select from jsonb_array_elements(public.search_chatbot_candidates(array[]::text[], '新しい回答')) e
    where e->>'content' = '公式の新しい回答です。'
  ) or not exists (
    select from jsonb_array_elements(public.search_chatbot_candidates(
      array[]::text[], '', array_fill(0.1::real, array[768])
    )) e where e->>'content' = '公式の新しい回答です。'
  ) then raise exception 'Authorized FAQ edit did not refresh both indexes';
  end if;
end;
$$;

rollback;
