import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

// Synthetic data only, in a disposable local database. Never run on Supabase.
if (
  !["localhost", "127.0.0.1"].includes(process.env.PGHOST) ||
  process.env.PGDATABASE !== "fortylove_chatbot_test"
) {
  throw new Error("Requires isolated local fortylove_chatbot_test database");
}
const corpus = Number(process.argv[2] ?? 1000);
if (![200, 1000, 5000, 10000].includes(corpus)) throw new Error("Use 200, 1000, 5000, or 10000 rows");
// Remove dead entries from previous rolled-back runs before inserting fixtures.
const sql = `vacuum (analyze) public.chatbot_knowledge;
begin;
set local search_path = public, extensions, pg_temp;
insert into chatbot_knowledge(id,title,content,category,keywords,source_type,source_name,embedding,updated_at)
select md5('benchmark-chatbot-'||i)::uuid,
  case when i%2=0 then '参加費の案内' else 'テニス練習' end || i,
  repeat('要項と集合場所を確認してください。項目'||i||'。',35),'試験',
  case when i%2=0 then array['参加費','当日'] else array['練習','コート'] end,
  'markdown','benchmark-only.md',
  array(select (case when i%2=0 then -1 else 1 end
    * (0.05+(i*v%113)*0.001+((i*37+v)%257)*0.00001))::real
        from generate_series(1,768) v), timestamp '2026-11-23'
from generate_series(1,${corpus}) i;
analyze public.chatbot_knowledge;
create temporary table benchmark_samples(
  mode text, ms double precision, payload_bytes integer, candidates integer, fingerprint text
) on commit drop;
do $$ declare mode text; started timestamptz; result jsonb; elapsed double precision;
  query_vector real[] := array_fill(0.1::real,array[768]);
begin
  foreach mode in array array['lexical','hybrid','indexed_lexical','indexed_semantic'] loop
    for i in 1..17 loop
      started := clock_timestamp();
      result := case when mode in ('lexical','hybrid') then
        search_chatbot_knowledge(array['benchmark-only.md'],'参加費の案内',
          case when mode='hybrid' then query_vector end)
      else search_chatbot_candidates(array['benchmark-only.md'],'参加費の案内',
          case when mode='indexed_semantic' then query_vector end) end;
      elapsed := extract(epoch from clock_timestamp()-started)*1000;
      if i>2 then
        insert into benchmark_samples values(mode,elapsed,octet_length(result::text),jsonb_array_length(result),
          (select md5(string_agg(
            (r - 'lexical_score' - 'semantic_score' ||
              jsonb_build_object('lexical_score',round((r->>'lexical_score')::numeric,12),
                'semantic_score',round((r->>'semantic_score')::numeric,12)))::text,
            '|' order by r->>'source_kind',r->>'id'
          )) from jsonb_array_elements(result) r));
      end if;
    end loop;
  end loop;
end $$;
with best_exact as materialized (
  select id from public.chatbot_knowledge
  where source_name = 'benchmark-only.md' and search_vector is not null
  order by (search_vector <=> array_fill(0.1::real,array[768])::vector(768)) + 0, id
  limit 20
), approximate as (
  select (item->>'id')::uuid as id from jsonb_array_elements(
    search_chatbot_candidates(array['benchmark-only.md'],'',array_fill(0.1::real,array[768]))
  ) item
)
select jsonb_build_object('corpus',${corpus},'externalApiCalls',0,
 'recallAt20',(select count(*) / 20.0 from best_exact join approximate using(id)),
 'measurement','local synthetic database only; excludes network and Gemini latency/cost',
 'modes',(select jsonb_object_agg(mode,to_jsonb(s)-'mode') from (
   select mode,count(*) samples,min(ms) "minMs",
     percentile_cont(0.5) within group(order by ms) "medianMs",
     percentile_cont(0.95) within group(order by ms) "p95Ms",
     max(candidates) "maxCandidates",max(payload_bytes) "payloadBytes",
     array_agg(distinct fingerprint) fingerprints
   from benchmark_samples group by mode
 ) s));
rollback;`;
const output = execFileSync(
  process.env.PSQL_BIN || "psql",
  ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"],
  {
    input: Buffer.from(sql),
    encoding: "utf8",
    env: { ...process.env, PGCLIENTENCODING: "UTF8" },
    windowsHide: true,
  },
);
const report = JSON.parse(output.trim());
mkdirSync(".ops-reports", { recursive: true });
writeFileSync(".ops-reports/chatbot-retrieval.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (report.modes.lexical.maxCandidates !== 20 || report.modes.hybrid.maxCandidates !== 40 ||
    report.modes.indexed_lexical.maxCandidates !== 20 || report.modes.indexed_semantic.maxCandidates !== 20)
  throw new Error("Expected independent, bounded lexical and semantic candidate lists");
if (report.recallAt20 < 0.9) throw new Error("Recall@20 fell below 90% for the synthetic benchmark");
if (Object.values(report.modes).some((mode) => mode.fingerprints.length !== 1))
  throw new Error("Non-deterministic search results");
if (report.modes.lexical.fingerprints[0] !== report.modes.indexed_lexical.fingerprints[0])
  throw new Error("Indexed lexical search changed the expected candidates or scores");
