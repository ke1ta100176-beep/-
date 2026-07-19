import {
  type AIChatMessage,
  type AIProvider,
  type ChatTurnResult,
  type StructuredGenerationArgs,
  type StructuredGenerationResult,
} from "../types";

/**
 * スタブAIプロバイダー。APIキー不要・決定的出力で、テスト/CI/APIキー未設定の
 * ローカル開発に使う。実APIは呼ばない。
 */
export class StubAIProvider implements AIProvider {
  readonly name = "stub";

  async generateStructured<T>(
    args: StructuredGenerationArgs<T>
  ): Promise<StructuredGenerationResult<T>> {
    const caption = extractCaption(args.userPrompt);
    const raw = buildStubAnalysis(caption);
    const parsed = args.schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`stub output failed schema validation: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      raw,
      modelName: "stub-model",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  async chatTurn(args: {
    systemPrompt: string;
    messages: AIChatMessage[];
    tools: { name: string }[];
  }): Promise<ChatTurnResult> {
    const hasToolResult = args.messages.some((m) => m.role === "tool_result");
    if (!hasToolResult && args.tools.some((t) => t.name === "query_posts")) {
      return {
        toolCall: {
          name: "query_posts",
          input: { sortBy: "trendScore", sortOrder: "desc", page: 1, pageSize: 10 },
          toolUseId: "stub-tool-1",
        },
        modelName: "stub-model",
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    const toolResult = args.messages.find((m) => m.role === "tool_result");
    const summary =
      toolResult && "content" in toolResult
        ? summarizeToolResult(toolResult.content)
        : "";
    return {
      text: `【スタブ回答】データベース検索結果に基づく回答です。${summary}\n※これはAPIキー未設定時のスタブ出力です。実際のAI回答にはANTHROPIC_API_KEYを設定してください。`,
      modelName: "stub-model",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

function extractCaption(userPrompt: string): string {
  const m = userPrompt.match(/キャプション:\s*([^\n]*)/);
  return m?.[1] ?? userPrompt.slice(0, 100);
}

function summarizeToolResult(content: string): string {
  try {
    const data = JSON.parse(content) as { totalCount?: number };
    return `対象投稿数: ${data.totalCount ?? 0}件。`;
  } catch {
    return "";
  }
}

function buildStubAnalysis(caption: string): Record<string, unknown> {
  const isRecipe = /レシピ|ごはん|おかず|茹で|混ぜる|そうめん|パン/.test(caption);
  const isFitness = /痩せ|トレ|ストレッチ|筋/.test(caption);
  const genre = isRecipe ? "レシピ" : isFitness ? "フィットネス" : "暮らし";
  const hookType = /まだ.*てる/.test(caption)
    ? "まだ○○してる？"
    : /実は/.test(caption)
      ? "実は"
      : /知らないと損/.test(caption)
        ? "知らないと損"
        : "その他";

  return {
    main_genre: genre,
    sub_genres: [isRecipe ? "時短" : "初心者向け"],
    themes: [caption.slice(0, 20) || "テーマ不明"],
    persona: "30代の忙しい主婦・主夫",
    pain_points: ["時間がない", "レパートリーが少ない"],
    benefits: ["すぐ実践できる", "時短になる"],
    hook_type: hookType,
    hook_text: caption.split(/[。！？ ]/)[0] ?? "",
    cta_type: /保存/.test(caption) ? "保存" : "CTAなし",
    emotions: ["驚き", "共感"],
    appeal_type: "時短訴求",
    personality_level: "中",
    video_structure: "フック→手順→完成→CTA（推定）",
    summary: `${genre}系の投稿。キャプションからの推定要約です。`,
    reasoning:
      "キャプションとハッシュタグに基づく分類です。相関はあるが、因果関係は断定できない点に注意してください。",
    confidence: 0.5,
    attributes: isRecipe
      ? { ingredients: ["そうめん"], cooking_methods: ["混ぜる"], season: "夏" }
      : {},
  };
}
