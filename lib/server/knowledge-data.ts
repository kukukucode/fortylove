import { db } from "@/lib/db";
import type { ChatbotKnowledge } from "@/lib/chatbot";

export async function readKnowledge(
  sourceNames: string[],
  question: string,
  vector?: number[],
  choiceId?: string,
): Promise<ChatbotKnowledge[]> {
  const { data, error } = await db().rpc("search_chatbot_knowledge", {
    p_sources: sourceNames,
    p_question: question,
    p_query: vector ?? null,
    p_choice: choiceId ?? null,
  });
  // Missing migration fails closed; never fall back to unrestricted reads.
  if (error || !Array.isArray(data)) throw new Error("回答資料を取得できませんでした。");
  return data as ChatbotKnowledge[];
}
