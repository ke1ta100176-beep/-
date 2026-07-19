import { describe, expect, it } from "vitest";
import {
  curveProgress,
  generateMockDataset,
} from "@/server/providers/instagram/mock/generator";
import { postAnalysisSchema } from "@/server/ai/schemas";
import { StubAIProvider } from "@/server/ai/stub";
import { z } from "zod";

describe("generateMockDataset", () => {
  it("同じシードで決定的に同じデータを生成する", () => {
    const now = new Date("2026-07-19T00:00:00Z");
    const a = generateMockDataset({ seed: 42, now });
    const b = generateMockDataset({ seed: 42, now });
    expect(a.accounts).toEqual(b.accounts);
    expect(a.posts.map((p) => p.platformPostId)).toEqual(
      b.posts.map((p) => p.platformPostId)
    );
  });

  it("十分な量と多様性がある（30+アカウント・300+投稿・複数ジャンル）", () => {
    const dataset = generateMockDataset({});
    expect(dataset.accounts.length).toBeGreaterThanOrEqual(30);
    expect(dataset.posts.length).toBeGreaterThanOrEqual(300);
    const genres = new Set(dataset.accounts.map((a) => a.genreSlug));
    expect(genres.size).toBeGreaterThanOrEqual(2);
    const curves = new Set(dataset.posts.map((p) => p.curveType));
    expect(curves.size).toBe(6); // 全成長カーブ型が出現する
  });

  it("小規模〜大規模アカウントのフォロワー分布がある", () => {
    const dataset = generateMockDataset({});
    const followers = dataset.accounts.map((a) => a.followersCount);
    expect(Math.min(...followers)).toBeLessThan(10_000);
    expect(Math.max(...followers)).toBeGreaterThan(100_000);
  });
});

describe("curveProgress（成長カーブ）", () => {
  it("単調非減少である（履歴の再生数が減らない）", () => {
    const types = [
      "strong_initial",
      "delayed_breakout",
      "fade_after_start",
      "steady",
      "small_account_anomaly",
      "underperformer",
    ] as const;
    for (const type of types) {
      let prev = 0;
      for (const h of [0, 6, 12, 24, 48, 72, 168, 336]) {
        const value = curveProgress(type, h);
        expect(value).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = value;
      }
    }
  });

  it("遅咲き型は24時間まで進捗が小さく、72時間で大きく伸びる", () => {
    expect(curveProgress("delayed_breakout", 24)).toBeLessThan(0.15);
    expect(curveProgress("delayed_breakout", 72)).toBeGreaterThan(0.8);
  });

  it("初速型は最初の12時間で半分以上に到達する", () => {
    expect(curveProgress("strong_initial", 12)).toBeGreaterThan(0.4);
  });
});

describe("StubAIProvider（AI出力バリデーション）", () => {
  it("スタブ出力がpostAnalysisSchemaを満たす", async () => {
    const stub = new StubAIProvider();
    const result = await stub.generateStructured({
      schema: postAnalysisSchema,
      jsonSchema: z.toJSONSchema(postAnalysisSchema) as Record<string, unknown>,
      systemPrompt: "test",
      userPrompt: "キャプション: まだ茹でてるの？そうめんアレンジ。保存してね",
      promptVersion: "test.v1",
    });
    expect(result.data.main_genre).toBe("レシピ");
    expect(result.data.hook_type).toBe("まだ○○してる？");
    expect(result.data.cta_type).toBe("保存");
    expect(result.data.confidence).toBeGreaterThan(0);
  });
});
