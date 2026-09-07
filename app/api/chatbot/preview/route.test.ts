import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),db:vi.fn(),read:vi.fn(),embed:vi.fn(),generate:vi.fn(),events:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSession:mocks.session}));
vi.mock("@/lib/db",()=>({db:mocks.db}));
vi.mock("@/lib/server/knowledge-data",()=>({readKnowledge:mocks.read}));
vi.mock("@/lib/embeddings",()=>({embedTexts:mocks.embed}));
vi.mock("@/lib/gemini-chatbot",()=>({generateGroundedAnswer:mocks.generate}));
vi.mock("@/lib/server/chatbot-events",()=>({answerEvents:mocks.events}));
import { POST } from "./route";
import { issueGeneralTicket } from "@/lib/server/general-answer-ticket";
beforeEach(()=>{
  vi.clearAllMocks(); vi.stubEnv("SESSION_SECRET","test-only-secret");
  mocks.session.mockResolvedValue({id:"member-1",role:"member"});
  mocks.db.mockReturnValue({rpc:mocks.rpc,from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({data:{role:"member"}}),maybeSingle:async()=>({data:table==="app_settings"?{chatbot_member_enabled:true,chatbot_member_sources:["member.md"],chatbot_admin_sources:["private.md"]}:null})})})})});
  mocks.rpc.mockResolvedValue({data:true}); mocks.read.mockResolvedValue([]); mocks.embed.mockRejectedValue(new Error("Offline"));
});
afterEach(()=>vi.unstubAllEnvs());
const request=(body:object)=>new Request("http://localhost/api/chatbot/preview",{method:"POST",body:JSON.stringify(body)});
it("資料なしでは回答生成を呼ばず一般回答ボタンを提案",async()=>{
  const result=await POST(request({message:"ラケットの選び方"}));
  expect((await result.json()).generalTicket).toBeTruthy(); expect(mocks.generate).not.toHaveBeenCalled();
});
it("固有情報に一般回答を提案せず有人対応を案内",async()=>{
  const data=await (await POST(request({message:"会費はいくらですか"}))).json();
  expect(data.generalTicket).toBeUndefined(); expect(data.offerEscalation).toBe(true);
});
it("memberがadmin対象を指定してもmember資料しか検索しない",async()=>{
  await POST(request({message:"質問です",audience:"admin"})); expect(mocks.read).toHaveBeenCalledWith(["member.md"]);
});
it("本人の一般回答ボタンからだけ生成し回数に含める",async()=>{
  mocks.generate.mockResolvedValue("体格に合ったラケットを選びましょう。");
  const generalTicket=issueGeneralTicket("member-1","member","ラケットの選び方");
  const data=await (await POST(request({message:"ラケットの選び方",generalTicket}))).json();
  expect(data.answer).toContain("公式回答ではありません"); expect(mocks.rpc).toHaveBeenCalledWith("consume_chatbot_message",expect.anything());
  expect((await POST(request({message:"ラケットの選び方",generalTicket:"forged"}))).status).toBe(400);
});
it("イベント質問は資料や生成処理に流さない",async()=>{
  mocks.events.mockResolvedValue("予定は登録されていません。");
  await POST(request({message:"次の練習はいつ"})); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
});
it("上限到達後は一般回答も生成しない",async()=>{
  mocks.rpc.mockResolvedValue({data:false});
  const ticket=issueGeneralTicket("member-1","member","ラケットの選び方");
  expect((await POST(request({message:"ラケットの選び方",generalTicket:ticket}))).status).toBe(429);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("通常質問のEmbeddingは再試行しない短時間設定を使う",async()=>{
  await POST(request({message:"質問です"}));
  expect(mocks.embed).toHaveBeenCalledWith(["質問です"],true,undefined,undefined,{maxAttempts:1,requestTimeoutMs:4000});
});
