import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

// Synthetic data only, in a disposable local database. Never run on Supabase.
if (
  !["localhost", "127.0.0.1"].includes(process.env.PGHOST) ||
  process.env.PGDATABASE !== "fortylove_chatbot_test"
) {
  throw new Error("Requires isolated local fortylove_chatbot_test database");
}
const sql = `begin;
insert into chatbot_knowledge(title,content,category,keywords,source_type,source_name,embedding)
select '合成資料の質問'||i,repeat('これは検索性能検証用の合成本文です。',30),'試験',array['合成資料'],
'markdown','benchmark-only.md',array_fill(0.1::real,array[768]) from generate_series(1,1000) i;
create temporary table benchmark_samples(ms double precision,payload_bytes integer,candidates integer) on commit drop;
do $$ declare started timestamptz; result jsonb; begin
  for i in 1..21 loop
    started := clock_timestamp();
    result := search_chatbot_knowledge(array['benchmark-only.md'],'合成資料の質問42',array_fill(0.1::real,array[768]));
    if i>1 then insert into benchmark_samples values(extract(epoch from clock_timestamp()-started)*1000,octet_length(result::text),jsonb_array_length(result)); end if;
  end loop;
end $$;
select jsonb_build_object('corpus',1000,'samples',20,'databaseP95Ms',(select percentile_cont(0.95) within group(order by ms) from benchmark_samples),
 'maxCandidates',(select max(candidates) from benchmark_samples),
 'candidatePayloadBytes',(select max(payload_bytes) from benchmark_samples),
 'previousFullCorpusPayloadBytes',(select octet_length(jsonb_agg(jsonb_build_object('id',id,'title',title,'content',content,'category',category,'keywords',keywords,'priority',priority,'is_active',is_active,'source_name',source_name))::text) from chatbot_knowledge where source_name='benchmark-only.md'),
 'externalApiCalls',0,'measurement','local synthetic database only; excludes network and Gemini latency/cost');
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
if (
  report.maxCandidates > 40 ||
  report.candidatePayloadBytes >= report.previousFullCorpusPayloadBytes
)
  throw new Error("Retrieval transfer regression");
mkdirSync(".ops-reports", { recursive: true });
writeFileSync(".ops-reports/chatbot-retrieval.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
