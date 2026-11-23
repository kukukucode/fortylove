begin;

-- Two disjoint top-20 sets, plus excluded sources with high scores.
insert into chatbot_knowledge(id,title,content,category,keywords,source_type,source_name,is_active,embedding)
select md5('search-test-'||i)::uuid,
  case when i<=24 then '参加費の案内' else 'テニス練習' end,
  '概要を確認してください。','試験',array['練習案内'],'markdown',
  case when i=50 then 'admin.md' else 'member.md' end,
  i<>49,
  case when i<=24 then array_fill(-0.1::real,array[768]) else array_fill(0.1::real,array[768]) end
from generate_series(1,50) i;

insert into faqs(id,question,answer,is_published)
values (md5('search-test-faq')::uuid,'ＱＡ　大会','専用の集合場所です。',true),
       (md5('search-test-draft')::uuid,'ＱＡ　大会','非公開の回答です。',false);

do $$
declare result jsonb;
  v_query real[] := array_fill(0.1::real,array[768]);
  v_choice uuid := md5('search-test-1')::uuid;
  v_faq uuid := md5('search-test-faq')::uuid;
begin
  result := search_chatbot_knowledge(array['member.md'],'参加費の案内',v_query);
  if jsonb_array_length(result)<>40 then raise exception 'Expected two disjoint top-20 lists'; end if;
  if (select count(*) from jsonb_array_elements(result) r where (r->>'lexical_score')::numeric=1)<>20
    or (select count(*) from jsonb_array_elements(result) r where (r->>'semantic_score')::numeric>=0.68)<>20
  then raise exception 'Independent ranking changed'; end if;
  if exists(select 1 from jsonb_array_elements(result) r
    where r ?| array['embedding','search_title','search_content','search_keywords','search_norm']
      or r->>'id' in (md5('search-test-49')::uuid::text,md5('search-test-50')::uuid::text))
  then raise exception 'Internal data, inactive row, or unauthorized source returned'; end if;
  result := search_chatbot_knowledge(array['member.md'],'その他',null,v_choice);
  if jsonb_array_length(result)<>1 or result->0->>'id' is distinct from v_choice::text
    or (result->0->>'lexical_score')::numeric is distinct from 0::numeric
  then raise exception 'Explicit choice without a matching score must still return the item'; end if;
  if search_chatbot_knowledge(array['member.md'],'その他',null,md5('search-test-50')::uuid)<>'[]'::jsonb
  then raise exception 'Choice must honor source permissions'; end if;
  result := search_chatbot_knowledge('{}'::text[],'qa大会');
  if jsonb_array_length(result)<>1 or result->0->>'id' is distinct from v_faq::text
    or (result->0->>'lexical_score')::numeric is distinct from 1::numeric
  then raise exception 'Normalized FAQ lookup or draft exclusion changed'; end if;

  update faqs set question='変更後の質問', answer='雨天の案内です。', embedding=v_query where id=v_faq;
  result := search_chatbot_knowledge('{}'::text[],'雨天の案内',v_query,v_faq);
  if (result->0->>'lexical_score')::numeric is distinct from 0.42
    or coalesce((result->0->>'semantic_score')::numeric,0) < 0.999
  then raise exception 'FAQ edit did not refresh search data'; end if;
  update chatbot_knowledge set title='変更したタイトル', keywords=array['ＵＰＤＡＴＥ'], embedding=v_query where id=v_choice;
  result := search_chatbot_knowledge(array['member.md'],'update',v_query,v_choice);
  if (result->0->>'lexical_score')::numeric is distinct from 0.42
    or coalesce((result->0->>'semantic_score')::numeric,0) < 0.999
  then raise exception 'Markdown edit did not refresh search data'; end if;
  update chatbot_knowledge set embedding=array_fill(0::real,array[768]) where id=v_choice;
  result := search_chatbot_knowledge(array['member.md'],'変更したタイトル',v_query,v_choice);
  if result->0->'semantic_score' is distinct from 'null'::jsonb then raise exception 'Zero vector handling changed'; end if;
end $$;

-- Direct FAQ updates also invoke the generated expressions.
-- Match Supabase's table grants in the plain PostgreSQL CI database.
grant select,update on faqs to service_role;
set local role service_role;
update faqs set answer='サービス側から編集' where id=md5('search-test-faq')::uuid;
reset role;
do $$ begin
  if not exists(select 1 from faqs where id=md5('search-test-faq')::uuid and search_content='サービス側から編集')
  then raise exception 'FAQ edit by service role failed'; end if;
end $$;
rollback;
