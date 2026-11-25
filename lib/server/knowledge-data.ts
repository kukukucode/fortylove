import { db } from "@/lib/db";
import type { ChatbotKnowledge } from "@/lib/chatbot";

const migrationProbeIntervalMs = 60_000;
let checkIndexedSearchAfter = 0;

export async function readKnowledge(
  sourceNames: string[],
  question: string,
  vector?: number[],
  choiceId?: string,
): Promise<ChatbotKnowledge[]> {
  const client = db();
  const parameters = {
    p_sources: sourceNames,
    p_question: question,
    p_query: vector ?? null,
    p_choice: choiceId ?? null,
  };
  if (Date.now() >= checkIndexedSearchAfter) {
    const { data, error } = await client.rpc("search_chatbot_candidates", parameters);
    // During rollout an older database may still have only the original RPC.
    if (error?.code !== "PGRST202") return requireCandidates(data, error);
    checkIndexedSearchAfter = Date.now() + migrationProbeIntervalMs;
  }
  const { data, error } = await client.rpc("search_chatbot_knowledge", parameters);
  return requireCandidates(data, error);
}

function requireCandidates(data: unknown, error: unknown): ChatbotKnowledge[] {
  // Both RPCs enforce the same scope; never substitute unrestricted reads.
  if (error || !Array.isArray(data)) throw new Error("回答資料を取得できませんでした。");
  return data as ChatbotKnowledge[];
}
