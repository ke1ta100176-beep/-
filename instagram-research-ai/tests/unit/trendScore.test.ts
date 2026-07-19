import { describe, expect, it } from "vitest";
import { computeTrendScore } from "@/server/scoring/trendScore";
import { DEFAULT_SCORING_POLICY } from "@/server/scoring/types";

const policy = DEFAULT_SCORING_POLICY;

describe("computeTrendScore", () => {
  it("急伸中の投稿は高スコアになる", () => {
    const result = computeTrendScore(
      {
        views: 500_000,
        prevViews: 100_000,
        hoursBetweenSnapshots: 12,
        hoursSincePosted: 24,
        followersCount: 10_000,
        accountMedianViews: 20_000,
      },
      policy
    );
    expect(result.trendScore).toBeGreaterThan(60);
    expect(result.velocityScore).toBeGreaterThan(0.8);
  });

  it("停滞している古い投稿は低スコアになる", () => {
    const result = computeTrendScore(
      {
        views: 10_000,
        prevViews: 9_990,
        hoursBetweenSnapshots: 24,
        hoursSincePosted: 500,
        followersCount: 100_000,
        accountMedianViews: 50_000,
      },
      policy
    );
    expect(result.trendScore).toBeLessThan(15);
  });

  it("saves/sharesがなくてもスコアがゼロにならない（加重和方式）", () => {
    const result = computeTrendScore(
      {
        views: 50_000,
        prevViews: 10_000,
        hoursBetweenSnapshots: 6,
        hoursSincePosted: 12,
        followersCount: 5_000,
        accountMedianViews: null, // アカウント履歴なし
      },
      policy
    );
    // 1成分（accountBaseline）が欠損しても他成分でスコアが出る
    expect(result.trendScore).toBeGreaterThan(30);
    expect(result.accountBaselineScore).toBe(0);
  });

  it("鮮度が低くても伸び始めた投稿（遅咲き）は高スコアを取れる", () => {
    const result = computeTrendScore(
      {
        views: 300_000,
        prevViews: 30_000,
        hoursBetweenSnapshots: 24,
        hoursSincePosted: 72, // 3日経過（鮮度低下）
        followersCount: 8_000,
        accountMedianViews: 15_000,
      },
      policy
    );
    expect(result.freshnessScore).toBeLessThan(0.6);
    expect(result.trendScore).toBeGreaterThan(55);
  });

  it("初回スナップショット（前回値なし）でも平均速度でスコア計算できる", () => {
    const result = computeTrendScore(
      {
        views: 60_000,
        prevViews: null,
        hoursBetweenSnapshots: null,
        hoursSincePosted: 6,
        followersCount: 10_000,
        accountMedianViews: 10_000,
      },
      policy
    );
    expect(result.velocityScore).toBeGreaterThan(0);
    expect(result.trendScore).toBeGreaterThan(0);
  });

  it("views=0でもNaNにならず0〜100の範囲に収まる", () => {
    const result = computeTrendScore(
      {
        views: 0,
        prevViews: null,
        hoursBetweenSnapshots: null,
        hoursSincePosted: 1,
        followersCount: 0,
        accountMedianViews: 0,
      },
      policy
    );
    expect(Number.isFinite(result.trendScore)).toBe(true);
    expect(result.trendScore).toBeGreaterThanOrEqual(0);
    expect(result.trendScore).toBeLessThanOrEqual(100);
  });

  it("フォロワー倍率: 小規模アカウントの異常な伸びを高く評価する", () => {
    const small = computeTrendScore(
      {
        views: 1_000_000,
        prevViews: 500_000,
        hoursBetweenSnapshots: 24,
        hoursSincePosted: 48,
        followersCount: 3_000, // 333倍
        accountMedianViews: 5_000,
      },
      policy
    );
    const large = computeTrendScore(
      {
        views: 1_000_000,
        prevViews: 500_000,
        hoursBetweenSnapshots: 24,
        hoursSincePosted: 48,
        followersCount: 2_000_000, // 0.5倍
        accountMedianViews: 800_000,
      },
      policy
    );
    expect(small.followerRatioScore).toBeGreaterThan(large.followerRatioScore);
    expect(small.trendScore).toBeGreaterThan(large.trendScore);
  });
});
