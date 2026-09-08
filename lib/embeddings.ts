export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_REQUEST_TIMEOUT_MS = 45_000;
const EMBEDDING_MAX_ATTEMPTS = 4;
const EMBEDDING_MAX_RETRY_DELAY_MS = 60_000;

export type EmbeddingRequestOptions = {
  maxAttempts?: number;
  requestTimeoutMs?: number;
  maxRetryDelayMs?: number;
};

type GeminiErrorResponse = {
  error?: {
    details?: Array<{ retryDelay?: string }>;
    status?: string;
  };
};

export type EmbeddingRetry = {
  completed: number;
  delayMs: number;
  reason: "rate_limit" | "temporary";
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelayMilliseconds(response: Response, data: GeminiErrorResponse | null, attempt: number, maxRetryDelayMs: number) {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : null;
  const retryDetail = data?.error?.details?.find((detail) => detail.retryDelay)?.retryDelay;
  const detailSeconds = retryDetail?.match(/^(\d+(?:\.\d+)?)s$/)?.[1];
  // Free-tier quota is commonly evaluated per embedded item. A 133-item import can
  // therefore cross a one-minute window even though it uses only a few HTTP calls.
  const fallback = response.status === 429 ? 60_000 : 1000 * 2 ** (attempt - 1);
  const suggested = seconds !== null ? seconds * 1000 : detailSeconds ? Number(detailSeconds) * 1000 : fallback;
  return Math.min(Math.max(suggested, 0), maxRetryDelayMs);
}

function embeddingErrorMessage(status: number) {
  if (status === 401 || status === 403) return "検索用APIの認証に失敗しました。Gemini APIキーを確認してください。";
  if (status === 429) return "Geminiの検索用APIが混雑しているか、利用枠に達しています。約1分待って再試行してください。";
  if (status === 400) return "検索用APIが入力を受け付けませんでした。Gemini APIの設定を確認してください。";
  if (status === 404) return "検索用モデルを利用できません。Gemini APIのモデル設定を確認してください。";
  return "検索用データの生成に失敗しました。接続を確認して再試行してください。";
}

async function requestEmbeddings(
  batch: string[],
  key: string,
  query: boolean,
  onRetry?: (retry: Omit<EmbeddingRetry, "completed">) => void,
  options: EmbeddingRequestOptions = {},
) {
  const maxAttempts = options.maxAttempts ?? EMBEDDING_MAX_ATTEMPTS;
  const requestTimeoutMs = options.requestTimeoutMs ?? EMBEDDING_REQUEST_TIMEOUT_MS;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? EMBEDDING_MAX_RETRY_DELAY_MS;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(requestTimeoutMs),
        body: JSON.stringify({ requests: batch.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] },
          taskType: query ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT", outputDimensionality: EMBEDDING_DIMENSIONS,
        })) }),
      });
    } catch {
      if (attempt === maxAttempts) throw new Error("検索用APIとの通信がタイムアウトしました。時間を置いて再試行してください。");
      const delayMs = 1000 * 2 ** (attempt - 1);
      onRetry?.({ delayMs, reason: "temporary" });
      await wait(delayMs);
      continue;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => null) as GeminiErrorResponse | null;
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxAttempts) {
        const delayMs = retryDelayMilliseconds(response, data, attempt, maxRetryDelayMs);
        onRetry?.({ delayMs, reason: response.status === 429 ? "rate_limit" : "temporary" });
        await wait(delayMs);
        continue;
      }
      throw new Error(embeddingErrorMessage(response.status));
    }

    const data = await response.json() as { embeddings?: { values: number[] }[] };
    if (data.embeddings?.length !== batch.length || data.embeddings.some(({ values }) => values.length !== EMBEDDING_DIMENSIONS || values.some((n) => !Number.isFinite(n)))) {
      throw new Error("検索用データを検証できませんでした。再試行してください。");
    }
    return data.embeddings.map(({ values }) => values);
  }
  throw new Error("検索用データの生成に失敗しました。再試行してください。");
}

// Persisted document vectors and queries always use the same model and dimensions.
export async function embedTexts(
  texts: string[],
  query = false,
  onProgress?: (completed: number) => void,
  onRetry?: (retry: EmbeddingRetry) => void,
  options?: EmbeddingRequestOptions,
): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("検索用APIが未設定です。設定後に再試行してください。");
  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    vectors.push(...await requestEmbeddings(batch, key, query, (retry) => onRetry?.({ ...retry, completed: vectors.length }), options));
    onProgress?.(vectors.length);
  }
  return vectors;
}
