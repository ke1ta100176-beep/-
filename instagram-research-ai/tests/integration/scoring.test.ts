import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runJob } from "@/server/jobs/jobRunner";
import { computeScoresJob } from "@/server/jobs/computeScores";
import { analyzePostsJob } from "@/server/jobs/analyzePosts";
import { appendMetricSnapshot } from "@/server/services/metrics";
import { queryPosts } from "@/server/db/repositories/postsRepo";
import { postFilterSchema } from "@/lib/schemas/postFilters";
import { respondToChat } from "@/server/chat/respond";

/** 履歴6件を持つアカウント+急伸投稿1件を作る */
async function seedScoringFixture() {
  const account = await prisma.account.create({
    data: {
      username: `scoring_fixture_${Date.now()}`,
      displayName: "スコア検証",
      followersCount: 10_000,
      sourceType: "mock",
    },
  });

  const now = new Date();
  const mkPost = async (
    idx: number,
    views: number,
    postedDaysAgo: number
  ): Promise<string> => {
    const postedAt = new Date(now.getTime() - postedDaysAgo * 24 * 3600_000);
    const post = await prisma.post.create({
      data: {
        accountId: account.id,
        platformPostId: `SCORE${idx}_${account.id.slice(-6)}`,
        instagramUrl: `https://www.instagram.com/reel/SCORE${idx}/`,
        postedAt,
        caption: `検証投稿${idx} そうめんアレンジ 保存してね`,
        sourceType: "mock",
        fetchStatus: "ok",
      },
    });
    await appendMetricSnapshot(
      post.id,
      {
        platformPostId: post.platformPostId,
        views: Math.round(views * 0.6),
        likes: 10,
        comments: 1,
        followersCount: 10_000,
        measuredAt: new Date(postedAt.getTime() + 24 * 3600_000),
      },
      "mock"
    );
    await appendMetricSnapshot(
      post.id,
      {
        platformPostId: post.platformPostId,
        views,
        likes: 20,
        comments: 2,
        followersCount: 10_000,
        measuredAt: new Date(postedAt.getTime() + 48 * 3600_000),
      },
      "mock"
    );
    return post.id;
  };

  // ベースライン投稿6件（約1万再生）+ 急伸投稿1件（30万再生）
  for (let i = 0; i < 6; i++) {
    await mkPost(i, 9_000 + i * 500, 30 - i * 2);
  }
  const risingId = await mkPost(9, 300_000, 3);
  return { account, risingId };
}

describe("スコア計算ジョブ（統合）", () => {
  let risingId: string;

  beforeAll(async () => {
    const fixture = await seedScoringFixture();
    risingId = fixture.risingId;
    const summary = await runJob("compute_scores", "test", async (ctx) => {
      await computeScoresJob(ctx);
    });
    expect(summary.status).toBe("success");
  });

  it("JobRunに実行記録が残る", async () => {
    const run = await prisma.jobRun.findFirstOrThrow({
      where: { jobType: "compute_scores" },
      orderBy: { startedAt: "desc" },
    });
    expect(run.status).toBe("success");
    expect(run.successCount).toBeGreaterThan(0);
    expect(run.finishedAt).not.toBeNull();
  });

  it("急伸投稿が「伸びた」判定+高トレンドスコアになる", async () => {
    const score = await prisma.postScore.findFirstOrThrow({
      where: { postId: risingId, isLatest: true },
    });
    expect(score.performanceClass).toBe("grew");
    expect(score.trendScore).toBeGreaterThan(40);
    expect(score.baselineSource).toBe("account");
    expect(score.calculationVersion).toBeGreaterThanOrEqual(1);
  });

  it("再実行してもスコア履歴は上書きされず追記される（isLatestフリップ）", async () => {
    await runJob("compute_scores", "test", async (ctx) => {
      await computeScoresJob(ctx);
    });
    const scores = await prisma.postScore.findMany({
      where: { postId: risingId },
      orderBy: { calculatedAt: "asc" },
    });
    expect(scores.length).toBeGreaterThanOrEqual(2);
    expect(scores.filter((s) => s.isLatest)).toHaveLength(1);
  });

  it("PostLatestMetricキャッシュへスコアが複製され一覧ソートに使える", async () => {
    const filter = postFilterSchema.parse({ sortBy: "trendScore", pageSize: 5 });
    const result = await queryPosts(filter);
    expect(result.posts.length).toBeGreaterThan(0);
    expect(result.posts[0].latestMetric?.trendScore).not.toBeNull();
    // 降順であること
    const scores = result.posts.map((p) => p.latestMetric?.trendScore ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("AI分析ジョブ+チャット（統合・スタブAI）", () => {
  beforeAll(async () => {
    const summary = await runJob("analyze_posts", "test", async (ctx) => {
      await analyzePostsJob(ctx);
    });
    expect(summary.status).toBe("success");
  });

  it("分析行が構造化フィールド+JSON+モデル名+プロンプトバージョン付きで保存される", async () => {
    const analysis = await prisma.aiAnalysis.findFirstOrThrow({
      where: { isLatest: true, status: { not: "failed" } },
    });
    expect(analysis.mainGenre).toBeTruthy();
    expect(analysis.analysisJson).not.toBeNull();
    expect(analysis.modelName).toBe("stub-model");
    expect(analysis.promptVersion).toBe("postTagging.v1");
    expect(analysis.confidenceScore).not.toBeNull();
  });

  it("再分析で履歴が残る（isLatestは常に1件）", async () => {
    const analysis = await prisma.aiAnalysis.findFirstOrThrow({
      where: { isLatest: true },
    });
    const { analyzePost } = await import("@/server/ai/analyzePost");
    await analyzePost(analysis.postId);
    const all = await prisma.aiAnalysis.findMany({
      where: { postId: analysis.postId },
    });
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.filter((a) => a.isLatest)).toHaveLength(1);
  });

  it("チャットがDB検索に基づいて回答し検索条件を記録する", async () => {
    const result = await respondToChat([], "急上昇している投稿を教えて");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.queryConditions.length).toBeGreaterThan(0);
    expect(result.referencedPostIds.length).toBeGreaterThan(0);
  });
});

describe("コレクション（統合）", () => {
  it("投稿の追加が冪等で、多対多で保存される", async () => {
    const user = await prisma.user.create({
      data: {
        email: `col_${Date.now()}@example.com`,
        name: "テスト",
        passwordHash: "x",
        role: "member",
      },
    });
    const collection = await prisma.collection.create({
      data: { name: "検証コレクション", createdById: user.id },
    });
    const post = await prisma.post.findFirstOrThrow();

    await prisma.collectionPost.upsert({
      where: {
        collectionId_postId: { collectionId: collection.id, postId: post.id },
      },
      update: {},
      create: { collectionId: collection.id, postId: post.id },
    });
    await prisma.collectionPost.upsert({
      where: {
        collectionId_postId: { collectionId: collection.id, postId: post.id },
      },
      update: {},
      create: { collectionId: collection.id, postId: post.id },
    });

    const count = await prisma.collectionPost.count({
      where: { collectionId: collection.id },
    });
    expect(count).toBe(1);
  });
});
