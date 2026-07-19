import { describe, expect, it } from "vitest";
import {
  classifyPerformance,
  excludeOutliers,
  median,
} from "@/server/scoring/classification";
import { DEFAULT_SCORING_POLICY } from "@/server/scoring/types";

const t = DEFAULT_SCORING_POLICY.classificationThresholds;

const history = (views: number[], followers = 10_000) =>
  views.map((v) => ({ views: v, followersCount: followers }));

describe("median / excludeOutliers", () => {
  it("中央値を正しく計算する", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("MADで極端な外れ値を除外する（1本のバズが基準を歪めない）", () => {
    const values = [10_000, 11_000, 9_000, 10_500, 9_500, 5_000_000];
    const filtered = excludeOutliers(values, t.madOutlierFactor);
    expect(filtered).not.toContain(5_000_000);
    expect(filtered.length).toBe(5);
  });
});

describe("classifyPerformance", () => {
  it("中央値の2倍以上は「伸びた」", () => {
    const result = classifyPerformance(
      {
        views: 25_000,
        hoursSincePosted: 48,
        followersCount: 10_000,
        accountHistory: history([10_000, 11_000, 9_000, 10_500, 9_500, 10_200]),
        categoryMedianViews: null,
      },
      t
    );
    expect(result.performanceClass).toBe("grew");
    expect(result.baselineSource).toBe("account");
  });

  it("中央値の0.7倍未満は「伸び悩み」", () => {
    const result = classifyPerformance(
      {
        views: 5_000,
        hoursSincePosted: 72,
        followersCount: 10_000,
        accountHistory: history([10_000, 11_000, 9_000, 10_500, 9_500, 10_200]),
        categoryMedianViews: null,
      },
      t
    );
    expect(result.performanceClass).toBe("underperformed");
  });

  it("24時間未満は too_early（早すぎる誤分類を防ぐ）", () => {
    const result = classifyPerformance(
      {
        views: 100,
        hoursSincePosted: 6,
        followersCount: 10_000,
        accountHistory: history([10_000, 11_000, 9_000, 10_500, 9_500, 10_200]),
        categoryMedianViews: null,
      },
      t
    );
    expect(result.performanceClass).toBe("too_early");
  });

  it("アカウント履歴不足時はカテゴリ中央値へフォールバックする", () => {
    const result = classifyPerformance(
      {
        views: 40_000,
        hoursSincePosted: 48,
        followersCount: 5_000,
        accountHistory: history([12_000, 9_000]), // 6件未満
        categoryMedianViews: 15_000,
      },
      t
    );
    expect(result.baselineSource).toBe("category");
    expect(result.performanceClass).toBe("grew");
  });

  it("履歴もカテゴリ基準もない場合は insufficient_data", () => {
    const result = classifyPerformance(
      {
        views: 40_000,
        hoursSincePosted: 48,
        followersCount: 5_000,
        accountHistory: [],
        categoryMedianViews: null,
      },
      t
    );
    expect(result.performanceClass).toBe("insufficient_data");
  });

  it("フォロワーが大きく変動したアカウントはフォロワー比で正規化する", () => {
    // フォロワー2千→2万に成長。生の再生数では新しい投稿が有利になるが、
    // 比率で見ると通常運転であることを検出する
    const result = classifyPerformance(
      {
        views: 20_000,
        hoursSincePosted: 48,
        followersCount: 20_000,
        accountHistory: [
          { views: 2_000, followersCount: 2_000 },
          { views: 2_200, followersCount: 2_500 },
          { views: 3_000, followersCount: 4_000 },
          { views: 8_000, followersCount: 8_000 },
          { views: 12_000, followersCount: 12_000 },
          { views: 18_000, followersCount: 18_000 },
        ],
        categoryMedianViews: null,
      },
      t
    );
    expect(result.followerNormalized).toBe(true);
    expect(result.performanceClass).toBe("normal");
  });

  it("バズ1本があっても外れ値除外により基準が保たれる", () => {
    const result = classifyPerformance(
      {
        views: 25_000,
        hoursSincePosted: 48,
        followersCount: 10_000,
        accountHistory: history([
          10_000, 11_000, 9_000, 10_500, 9_500, 10_200, 8_000_000,
        ]),
        categoryMedianViews: null,
      },
      t
    );
    // 外れ値(800万)が中央値を歪めないため 25,000/約10,000 = 2.4倍 → grew
    expect(result.performanceClass).toBe("grew");
  });
});
