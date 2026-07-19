import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { postFilterSchema, type PostFilter } from "@/lib/schemas/postFilters";
import { getAIProvider } from "@/server/ai";
import { HEDGING_INSTRUCTION } from "@/server/ai/guardrails";
import {
  aggregatePosts,
  buildPostWhere,
  queryPosts,
} from "@/server/db/repositories/postsRepo";
import type { AIChatMessage } from "@/server/ai/types";

const MIN_RESULT_COUNT = 3;
const MAX_TOOL_ROUNDS = 4;

const CHAT_SYSTEM_PROMPT = `あなたはInstagram競合リサーチの専属アナリストAIです。
社内データベースに保存された投稿・数値履歴・AI分析結果に基づいて回答します。

必ず守るルール:
- 一般論だけで回答しない。必ず query_posts ツールでデータベースを検索し、結果に基づいて回答する。
- 回答には次を含める: 分析対象となった投稿数 / 対象期間 / 抽出条件 / 主な傾向 / 根拠となる投稿（[POST:投稿ID] 形式で引用）。
- データが不足している場合（該当が少ない等）は、その旨を明示する。
- 現在日時や「直近◯日」の質問には postedAfter フィルタを使う。
- 「伸びた」は performanceClass=grew、「急上昇」は minTrendScore を使う。
- 根拠となる投稿は必ず [POST:xxxx] 形式のIDで引用する（UIが詳細画面へのリンクに変換する）。

${HEDGING_INSTRUCTION}`;

export interface ChatRespondResult {
  text: string;
  referencedPostIds: string[];
  queryConditions: unknown[];
  modelName: string;
}

/**
 * AIチャット1問への応答。
 * Anthropic tool-use ループ: モデルが query_posts を呼ぶ→Postgres実行→結果を返す→最終回答。
 * 該当件数が閾値未満なら決定的に「データ不足」を明示させる。
 */
export async function respondToChat(
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string
): Promise<ChatRespondResult> {
  const ai = getAIProvider();
  const queryConditions: unknown[] = [];
  const referencedPostIds = new Set<string>();

  // ツール定義用: Date型はJSON Schema化できないためISO文字列として宣言する。
  // 実行時は postFilterSchema（z.coerce.date）が文字列から復元する。
  const toolInputSchema = postFilterSchema.extend({
    postedAfter: z
      .string()
      .describe("ISO8601日時。例: 2026-07-01T00:00:00Z")
      .optional(),
    postedBefore: z.string().describe("ISO8601日時").optional(),
  });
  const filterJsonSchema = z.toJSONSchema(toolInputSchema) as Record<
    string,
    unknown
  >;
  const tools = [
    {
      name: "query_posts",
      description:
        "投稿データベースを検索し、一致した投稿の一覧と集計（平均/中央値再生数、上位テーマ・フック・CTA・属性）を返す。",
      inputSchema: filterJsonSchema,
    },
  ];

  const messages: AIChatMessage[] = [
    ...history.map(
      (m): AIChatMessage =>
        m.role === "user"
          ? { role: "user", content: m.content }
          : { role: "assistant", content: m.content }
    ),
    { role: "user", content: userMessage },
  ];

  let modelName = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await ai.chatTurn({
      systemPrompt: CHAT_SYSTEM_PROMPT,
      messages,
      tools,
    });
    modelName = turn.modelName;

    if (turn.text !== undefined && !turn.toolCall) {
      return {
        text: turn.text,
        referencedPostIds: extractPostIds(turn.text, referencedPostIds),
        queryConditions,
        modelName,
      };
    }

    if (turn.toolCall) {
      const parsed = postFilterSchema.safeParse(turn.toolCall.input);
      let resultContent: string;

      if (!parsed.success) {
        resultContent = JSON.stringify({
          error: `フィルタが不正です: ${parsed.error.message}`,
        });
      } else {
        const result = await executeQueryTool(parsed.data);
        queryConditions.push(parsed.data);
        result.posts.forEach((p) => referencedPostIds.add(p.id));
        resultContent = JSON.stringify(result);
      }

      messages.push(
        { role: "assistant", toolCall: turn.toolCall },
        {
          role: "tool_result",
          toolUseId: turn.toolCall.toolUseId,
          content: resultContent,
        }
      );
    }
  }

  // ツールループが収束しない場合のフォールバック
  return {
    text: "検索処理が収束しませんでした。質問を絞って再度お試しください。",
    referencedPostIds: [...referencedPostIds],
    queryConditions,
    modelName,
  };
}

interface QueryToolResult {
  totalCount: number;
  insufficientData: boolean;
  note?: string;
  posts: {
    id: string;
    username: string;
    postedAt: string | null;
    caption: string | null;
    views: number | null;
    trendScore: number | null;
    performanceClass: string | null;
    followerRatio: number | null;
    themes: string[];
    hookType: string | null;
    ctaType: string | null;
  }[];
  aggregates: Awaited<ReturnType<typeof aggregatePosts>> | null;
}

async function executeQueryTool(filter: PostFilter): Promise<QueryToolResult> {
  const capped: PostFilter = { ...filter, pageSize: Math.min(filter.pageSize, 30) };
  const result = await queryPosts(capped);
  const insufficientData = result.totalCount < MIN_RESULT_COUNT;

  const aggregates = insufficientData
    ? null
    : await aggregatePosts(buildPostWhere(capped));

  return {
    totalCount: result.totalCount,
    insufficientData,
    note: insufficientData
      ? `該当投稿が${result.totalCount}件しかありません。データ不足のため傾向分析はできません。回答では必ずデータ不足である旨を明示してください。`
      : undefined,
    posts: result.posts.map((p) => ({
      id: p.id,
      username: p.account.username,
      postedAt: p.postedAt?.toISOString() ?? null,
      caption: p.caption?.slice(0, 120) ?? null,
      views: p.latestMetric?.views ?? null,
      trendScore: p.latestMetric?.trendScore ?? null,
      performanceClass: p.latestMetric?.performanceClass ?? null,
      followerRatio: p.latestMetric?.followerRatio ?? null,
      themes: p.analyses[0]?.themes ?? [],
      hookType: p.analyses[0]?.hookType ?? null,
      ctaType: p.analyses[0]?.ctaType ?? null,
    })),
    aggregates,
  };
}

function extractPostIds(text: string, known: Set<string>): string[] {
  const ids = new Set<string>(known);
  const matches = text.matchAll(/\[POST:([a-z0-9]+)\]/gi);
  for (const m of matches) ids.add(m[1]);
  return [...ids];
}

/** チャットメッセージの保存（検索条件・引用投稿IDのグラウンディング記録付き） */
export async function saveChatExchange(
  sessionId: string,
  userMessage: string,
  result: ChatRespondResult
): Promise<void> {
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: { sessionId, role: "user", content: userMessage },
    }),
    prisma.chatMessage.create({
      data: {
        sessionId,
        role: "assistant",
        content: result.text,
        queryConditions: result.queryConditions as object[],
        referencedPostIds: result.referencedPostIds,
      },
    }),
    prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ]);
}
