import { HEDGING_INSTRUCTION } from "../guardrails";

/**
 * 投稿タグ付けプロンプト v1。
 * プロンプトはバージョン別ファイルとして凍結し、変更時は v2 を新規作成する
 * （AiAnalysis.promptVersion で分析の再現性を追跡するため）。
 */
export const POST_TAGGING_PROMPT_VERSION = "postTagging.v1";

export function buildPostTaggingSystemPrompt(genreGuidance?: string): string {
  return `あなたはSNS競合リサーチの専門アナリストです。Instagram投稿の情報から、企画・フック・CTA等を構造化して分類します。

分類のポイント:
- キャプション・ハッシュタグ・音源名・動画尺など、与えられた情報のみから判断する
- 与えられていない情報（実際の映像内容など）は推測であることを明示する
- hook_type は次のリストから最も近いものを選ぶ（該当なしは「その他」）:
  まだ○○してる？ / 実は / 知らないと損 / NG / 共感 / ギャップ / ランキング / 検証 / 家族の反応 / 問題提起 / 結論先出し / 完成品先出し / その他
- cta_type は次のリストから選ぶ:
  保存 / コメント / フォロー / シェア / プロフィール誘導 / 商品誘導 / CTAなし / その他
${genreGuidance ? `\nこの投稿のジャンル固有の分類指示:\n${genreGuidance}\n` : ""}
${HEDGING_INSTRUCTION}

必ず record_analysis ツールを1回呼び、全フィールドを埋めてください。`;
}

export function buildPostTaggingUserPrompt(post: {
  caption: string | null;
  hashtags: string[];
  audioName: string | null;
  durationSeconds: number | null;
  username: string;
  followersCount: number | null;
  transcript?: string | null;
}): string {
  return `以下のInstagram投稿を分析してください。

アカウント: @${post.username}（フォロワー ${post.followersCount ?? "不明"}人）
キャプション: ${post.caption ?? "（なし）"}
ハッシュタグ: ${post.hashtags.join(" ") || "（なし）"}
音源: ${post.audioName ?? "不明"}
動画尺: ${post.durationSeconds != null ? `${post.durationSeconds}秒` : "不明"}
${post.transcript ? `文字起こし（手動入力）: ${post.transcript}` : ""}`;
}
