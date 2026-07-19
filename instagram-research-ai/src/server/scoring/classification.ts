import type { ClassificationThresholds } from "./types";

export type PerformanceClassValue =
  | "grew"
  | "normal"
  | "underperformed"
  | "too_early"
  | "insufficient_data";

export interface ClassificationInput {
  views: number | null;
  hoursSincePosted: number | null;
  followersCount: number | null;
  /** 同一アカウント過去投稿（対象投稿を除く）: [{views, followersCount}] 新しい順 */
  accountHistory: { views: number; followersCount: number | null }[];
  /** アカウント履歴が不足する場合のカテゴリ横断中央値 */
  categoryMedianViews: number | null;
}

export interface ClassificationResult {
  performanceClass: PerformanceClassValue;
  baselineSource: "account" | "category" | "none";
  baselineViews: number | null;
  ratio: number | null;
  /** フォロワー変動が大きくフォロワー比で正規化した場合 true */
  followerNormalized: boolean;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** MAD（中央絶対偏差）ベースで極端な外れ値を除外する。1本のバズが基準を歪めないため。 */
export function excludeOutliers(values: number[], madFactor: number): number[] {
  if (values.length < 4) return values;
  const med = median(values);
  if (med === null) return values;
  const deviations = values.map((v) => Math.abs(v - med));
  const mad = median(deviations);
  if (mad === null || mad === 0) return values;
  return values.filter((v) => Math.abs(v - med) <= madFactor * mad);
}

/**
 * 成功・通常・伸び悩み分類。
 * - 経過時間ゲート: minElapsedHours 未満は too_early
 * - アカウント履歴が minSampleSize 未満ならカテゴリ中央値へフォールバック
 * - 窓内フォロワー変動 > followerDriftRatio ならフォロワー比で正規化
 */
export function classifyPerformance(
  input: ClassificationInput,
  t: ClassificationThresholds
): ClassificationResult {
  const none: Omit<ClassificationResult, "performanceClass"> = {
    baselineSource: "none",
    baselineViews: null,
    ratio: null,
    followerNormalized: false,
  };

  if (input.views === null) {
    return { performanceClass: "insufficient_data", ...none };
  }
  if (
    input.hoursSincePosted !== null &&
    input.hoursSincePosted < t.minElapsedHours
  ) {
    return { performanceClass: "too_early", ...none };
  }

  const window = input.accountHistory.slice(0, t.trailingWindow);

  if (window.length >= t.minSampleSize) {
    const followerValues = window
      .map((h) => h.followersCount)
      .filter((f): f is number => f !== null && f > 0);
    let followerNormalized = false;
    let baseline: number | null;
    let current = input.views;

    if (followerValues.length >= 2) {
      const maxF = Math.max(...followerValues);
      const minF = Math.min(...followerValues);
      followerNormalized = (maxF - minF) / maxF > t.followerDriftRatio;
    }

    if (followerNormalized && input.followersCount && input.followersCount > 0) {
      // フォロワーが大きく変動したアカウントは再生数/フォロワー比で比較する
      const ratios = window
        .filter((h) => h.followersCount && h.followersCount > 0)
        .map((h) => h.views / (h.followersCount as number));
      baseline = median(excludeOutliers(ratios, t.madOutlierFactor));
      current = input.views / input.followersCount;
    } else {
      followerNormalized = false;
      baseline = median(
        excludeOutliers(
          window.map((h) => h.views),
          t.madOutlierFactor
        )
      );
    }

    if (baseline !== null && baseline > 0) {
      const ratio = current / baseline;
      return {
        performanceClass: classifyRatio(ratio, t),
        baselineSource: "account",
        baselineViews: followerNormalized ? null : baseline,
        ratio,
        followerNormalized,
      };
    }
  }

  if (input.categoryMedianViews !== null && input.categoryMedianViews > 0) {
    const ratio = input.views / input.categoryMedianViews;
    return {
      performanceClass: classifyRatio(ratio, t),
      baselineSource: "category",
      baselineViews: input.categoryMedianViews,
      ratio,
      followerNormalized: false,
    };
  }

  return { performanceClass: "insufficient_data", ...none };
}

function classifyRatio(
  ratio: number,
  t: ClassificationThresholds
): PerformanceClassValue {
  if (ratio >= t.grewRatio) return "grew";
  if (ratio < t.underperformRatio) return "underperformed";
  return "normal";
}
