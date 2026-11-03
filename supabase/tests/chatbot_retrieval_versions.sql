begin;
insert into users(id,name,password_hash,role) values
 ('92000000-0000-4000-8000-000000000001','Version owner','test','super_admin'),
 ('92000000-0000-4000-8000-000000000002','Version member','test','member');
do $$
declare actor uuid := '92000000-0000-4000-8000-000000000001';
  original text := E'## 会費はいくらですか\n3000円です。';
  original2 text := E'## 会費はいくらですか\n4000円です。';
  rows jsonb; v_id uuid; n integer; result jsonb;
begin
  rows := jsonb_build_array(jsonb_build_object('title','会費はいくらですか','content','3000円です。','category','基本情報',
    'keywords',array['会費'],'source_section','1:会費','embedding',array_fill(0.1::real,array[768])));
  n := publish_chatbot_document(actor,'member.md',original,encode(sha256(convert_to(original,'UTF8')),'hex'),'gemini-embedding-001',rows,0);
  if n<>1 then raise exception 'First version failed'; end if;
  select id into v_id from chatbot_document_versions where version=1 and document_id=(select id from chatbot_documents where source_name='member.md');
  begin
    perform publish_chatbot_document(actor,'member.md',original2,encode(sha256(convert_to(original2,'UTF8')),'hex'),'gemini-embedding-001','[{"title":"broken"}]',1);
    raise exception 'Invalid import accepted';
  exception when others then if sqlerrm='Invalid import accepted' then raise; end if; end;
  if (select active_version from chatbot_documents where source_name='member.md')<>1 then raise exception 'Partial publication'; end if;
  if (select count(*) from chatbot_document_versions where document_id=(select id from chatbot_documents where source_name='member.md'))<>1 then raise exception 'Failed version persisted'; end if;
  n := publish_chatbot_document(actor,'member.md',original2,encode(sha256(convert_to(original2,'UTF8')),'hex'),'gemini-embedding-001',jsonb_set(rows,'{0,content}','"4000円です。"'),1);
  begin
    perform publish_chatbot_document(actor,'member.md',original,encode(sha256(convert_to(original,'UTF8')),'hex'),'gemini-embedding-001',rows,1);
    raise exception 'Stale review accepted';
  exception when others then if sqlerrm <> 'Document changed; review again' then raise; end if; end;
  n := restore_chatbot_document(actor,v_id,2);
  if n<>3 or (select content from chatbot_knowledge where source_name='member.md')<>'3000円です。' then raise exception 'Restore failed'; end if;
  if (select markdown from chatbot_document_versions where id=v_id)<>original then raise exception 'Original changed'; end if;
  begin
    perform restore_chatbot_document('92000000-0000-4000-8000-000000000002',v_id,3);
    raise exception 'Member restore accepted';
  exception when others then if sqlerrm <> 'Forbidden' then raise; end if; end;
  result := search_chatbot_knowledge(array['member.md'],'会費はいくらですか');
  if jsonb_array_length(result)<>1 or result->0->>'source_version'<>'3' then raise exception 'Provenance missing'; end if;
  if jsonb_array_length(search_chatbot_knowledge(array[]::text[],'会費はいくらですか'))<>0 then raise exception 'Private source leak'; end if;
  update chatbot_knowledge set is_active=false where source_name='member.md';
  if jsonb_array_length(search_chatbot_knowledge(array['member.md'],'会費はいくらですか',array_fill(0.1::real,array[768])))<>0 then raise exception 'Inactive source leak'; end if;
  perform delete_chatbot_document(actor,'member.md');
  if exists(select 1 from chatbot_document_versions where id=v_id) then raise exception 'Deleted original survives'; end if;
  if has_function_privilege('public','public.search_chatbot_knowledge(text[],text,real[],uuid)','execute') then raise exception 'Public retrieval allowed'; end if;
  if has_table_privilege('public','public.chatbot_document_versions','select') then raise exception 'Public originals allowed'; end if;
end $$;
-- Published FAQ is retrieved without a Markdown source, drafts never are.
insert into faqs(question,answer,is_published) values('公開会費質問','公開回答',true),('非公開会費質問','秘密の回答',false);
do $$ begin
  if not exists(select 1 from jsonb_array_elements(search_chatbot_knowledge(array[]::text[],'公開会費質問')) x where x->>'source_kind'='faq') then raise exception 'FAQ missing'; end if;
  if exists(select 1 from jsonb_array_elements(search_chatbot_knowledge(array[]::text[],'非公開会費質問')) x where x->>'content'='秘密の回答') then raise exception 'Draft leak'; end if;
end $$;
-- Corpus-size regression: independent candidate lists remain bounded and vectors
-- are not returned to the application. Rollback removes all synthetic data.
insert into chatbot_knowledge(title,content,category,keywords,source_type,source_name,embedding)
  select 'テスト会費'||i,'合成データの説明です。','試験',array['テスト会費'],'markdown','large.md',array_fill(0.1::real,array[768])
  from generate_series(1,1000) i;
do $$ declare result jsonb; begin
  result := search_chatbot_knowledge(array['large.md'],'テスト会費',array_fill(0.1::real,array[768]));
  if jsonb_array_length(result)>40 or jsonb_array_length(result)=0 then raise exception 'Unbounded candidate list'; end if;
  if exists(select 1 from jsonb_array_elements(result) x where x ? 'embedding') then raise exception 'Vectors returned'; end if;
  if exists(select 1 from pg_roles where rolname='anon') then
    if has_table_privilege('anon','public.chatbot_document_versions','select') then raise exception 'Originals exposed'; end if;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    if has_table_privilege('authenticated','public.chatbot_document_versions','select') then raise exception 'Originals exposed'; end if;
  end if;
end $$;
rollback;
