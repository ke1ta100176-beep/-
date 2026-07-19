import type { ScoringPolicy } from "./types";

export interface TrendScoreInput {
  /** 最新スナップショットの再生数 */
  views: number | null;
  /** 前回スナップショットの再生数（初回はnull） */
  prevViews: number | null;
  /** 最新と前回スナップショットの間隔（時間） */
  hoursBetweenSnapshots: number | null;
  /** 投稿からの経過時間 */
  hoursSincePosted: number | null;
  followersCount: number | null;
  /** 同一アカウント過去投稿の再生数中央値（外れ値除外済み） */
  accountMedianViews: number | null;
}

export interface TrendScoreResult {
  trendScore: number;
  velocityScore: number;
  growthScore: number;
  followerRatioScore: number;
  freshnessScore: number;
  accountBaselineScore: number;
  breakdown: Record<string, number | null>;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * トレンドスコア v1。
 * 素の比率の積は1因子のゼロ/欠損で全体が消えるため、対数減衰+正規化+
 * 上限クリップした成分の加重和（0〜100）を採用する。
 * saves/shares は取得できない投稿が多いため v1 では成分に含めない。
 */
export function computeTrendScore(
  input: TrendScoreInput,
  policy: ScoringPolicy
): TrendScoreResult {
  const w = policy.weights;
  const views = input.views ?? 0;

  // 1時間あたり再生増加。前回値がない初回は投稿時からの平均速度で代替する。
  let viewsPerHour: number | null = null;
  if (
    input.prevViews !== null &&
    input.hoursBetweenSnapshots !== null &&
    input.hoursBetweenSnapshots > 0
  ) {
    viewsPerHour = Math.max(0, views - input.prevViews) / input.hoursBetweenSnapshots;
  } else if (input.hoursSincePosted !== null && input.hoursSincePosted > 0) {
    viewsPerHour = views / input.hoursSincePosted;
  }
  const velocityScore =
    viewsPerHour === null
      ? 0
      : clamp(Math.log1p(viewsPerHour) / Math.log1p(w.velocityNorm), 0, 1);

  // 前回取得時からの増加率
  let growthRate: number | null = null;
  if (input.prevViews !== null && input.prevViews > 0) {
    growthRate = (views - input.prevViews) / input.prevViews;
  }
  const growthScore =
    growthRate === null ? 0 : clamp(growthRate, 0, w.growthCap) / w.growthCap;

  // フォロワー数に対する再生倍率
  const followers = Math.max(1, input.followersCount ?? 1);
  const ratio = views / followers;
  const followerRatioScore = clamp(
    Math.log1p(ratio) / Math.log1p(w.followerRatioNorm),
    0,
    1
  );

  // 同一アカウント過去中央値との差
  let baselineDelta: number | null = null;
  if (input.accountMedianViews !== null && input.accountMedianViews > 0) {
    baselineDelta = (views - input.accountMedianViews) / input.accountMedianViews;
  }
  const accountBaselineScore =
    baselineDelta === null
      ? 0
      : clamp(baselineDelta, -1, w.baselineDeltaCap) / w.baselineDeltaCap;

  // 投稿鮮度（線形減衰）。加重和なので鮮度が低くても他成分で高スコアになりうる
  // （=「24時間後から伸びた投稿」を殺さない）。
  const freshnessScore =
    input.hoursSincePosted === null
      ? 0
      : clamp(1 - input.hoursSincePosted / w.freshnessWindowHours, 0, 1);

  const weighted =
    w.velocity * velocityScore +
    w.growth * growthScore +
    w.followerRatio * followerRatioScore +
    w.accountBaseline * Math.max(0, accountBaselineScore) +
    w.freshness * freshnessScore;

  const trendScore = Math.round(clamp(weighted, 0, 1) * 1000) / 10;

  return {
    trendScore,
    velocityScore,
    growthScore,
    followerRatioScore,
    freshnessScore,
    accountBaselineScore,
    breakdown: {
      viewsPerHour,
      growthRate,
      followerRatio: ratio,
      baselineDelta,
      hoursSincePosted: input.hoursSincePosted,
    },
  };
}
