import { z } from "zod";

/** フックタイプの既定リスト（DB enumにせず設定として保持。「その他」+後日追加に対応） */
export const HOOK_TYPES = [
  "まだ○○してる？",
  "実は",
  "知らないと損",
  "NG",
  "共感",
  "ギャップ",
  "ランキング",
  "検証",
  "家族の反応",
  "問題提起",
  "結論先出し",
  "完成品先出し",
  "その他",
] as const;

export const CTA_TYPES = [
  "保存",
  "コメント",
  "フォロー",
  "シェア",
  "プロフィール誘導",
  "商品誘導",
  "CTAなし",
  "その他",
] as const;

/**
 * AIタグ付けの構造化出力スキーマ（ジャンル共通コア）。
 * ジャンル固有属性は attributes（動的キー）に分離し、全ジャンルに対応する。
 */
export const postAnalysisSchema = z.object({
  main_genre: z.string().min(1).describe("メインジャンル（例: レシピ、フィットネス、暮らし）"),
  sub_genres: z.array(z.string()).max(5).describe("サブジャンル"),
  themes: z.array(z.string()).min(1).max(5).describe("投稿のテーマ・企画"),
  persona: z.string().describe("想定視聴者ペルソナ"),
  pain_points: z.array(z.string()).max(5).describe("想定される悩み"),
  benefits: z.array(z.string()).max(5).describe("視聴者が得るベネフィット"),
  hook_type: z.string().describe("フックタイプ"),
  hook_text: z.string().describe("フックとして機能している文言"),
  cta_type: z.string().describe("CTAタイプ"),
  emotions: z.array(z.string()).max(4).describe("喚起される感情"),
  appeal_type: z.string().describe("訴求タイプ（例: 時短訴求、健康訴求、共感訴求）"),
  personality_level: z
    .enum(["高", "中", "低"])
    .describe("属人性の強さ（発信者個人への依存度）"),
  video_structure: z.string().describe("動画構成の推定（キャプション等から）"),
  summary: z.string().min(1).describe("企画の要約（1〜2文）"),
  reasoning: z.string().describe("分析理由。相関ベースの表現とし因果を断定しない"),
  confidence: z.number().min(0).max(1).describe("分析の自己申告信頼度"),
  attributes: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .describe("ジャンル固有属性（例: レシピなら ingredients, cooking_methods, season）"),
});

export type PostAnalysisOutput = z.infer<typeof postAnalysisSchema>;

/** AIチャットの検索ツール引数（投稿一覧のフィルタと同一スキーマを共有） */
export { postFilterSchema } from "@/lib/schemas/postFilters";
