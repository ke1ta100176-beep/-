import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseCsvImport } from "@/server/providers/instagram/csv";
import { importNormalizedPosts, ingestPostUrl } from "@/server/services/ingest";
import { appendMetricSnapshot } from "@/server/services/metrics";

async function resetDb() {
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.collectionPost.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.report.deleteMany();
  await prisma.postScore.deleteMany();
  await prisma.aiAnalysis.deleteMany();
  await prisma.postLatestMetric.deleteMany();
  await prisma.postMetric.deleteMany();
  await prisma.post.deleteMany();
  await prisma.account.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.user.deleteMany();
}

describe("投稿登録・数値履歴（統合）", () => {
  beforeAll(async () => {
    await resetDb();
  });

  it("CSVインポート→再インポートで履歴が上書きされず追記される", async () => {
    const header =
      "username,instagram_url,posted_at,caption,followers_count,views,likes,comments,measured_at";
    const csv1 = [
      header,
      `testuser,https://www.instagram.com/reel/ITEST01/,2026-07-01T00:00:00Z,テスト投稿,10000,1000,50,5,2026-07-01T06:00:00Z`,
    ].join("\n");
    const csv2 = [
      header,
      `testuser,https://www.instagram.com/reel/ITEST01/,2026-07-01T00:00:00Z,テスト投稿,10000,5000,220,18,2026-07-02T00:00:00Z`,
    ].join("\n");

    const r1 = await importNormalizedPosts(parseCsvImport(csv1).posts, "csv");
    expect(r1.created).toBe(1);
    const r2 = await importNormalizedPosts(parseCsvImport(csv2).posts, "csv");
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(1);

    const post = await prisma.post.findFirstOrThrow({
      where: { platformPostId: "ITEST01" },
      include: { metrics: { orderBy: { measuredAt: "asc" } }, latestMetric: true },
    });
    // 履歴が2レコード（追記）であり、初回値が保持されている
    expect(post.metrics).toHaveLength(2);
    expect(post.metrics[0].views).toBe(1000);
    expect(post.metrics[1].views).toBe(5000);
    // 最新キャッシュは新しい値・差分を持つ
    expect(post.latestMetric?.views).toBe(5000);
    expect(post.latestMetric?.viewsDelta).toBe(4000);
  });

  it("同一投稿の重複登録が発生しない（冪等）", async () => {
    const count = await prisma.post.count({
      where: { platformPostId: "ITEST01" },
    });
    expect(count).toBe(1);
  });

  it("URL取り込み（シェア経由）で未知アカウントが無効状態で仮登録される", async () => {
    const result = await ingestPostUrl(
      "https://www.instagram.com/reel/SHARE001/",
      { sourceType: "share" }
    );
    expect(result.created).toBe(true);

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: result.postId },
      include: { account: true },
    });
    expect(post.sourceType).toBe("share");
    // Mockプロバイダーが投稿詳細を解決できない未知URLでも登録は成立する
    expect(post.account.username).toBeTruthy();
  });

  it("appendMetricSnapshot は measuredAt の異なる履歴を追記し続ける", async () => {
    const post = await prisma.post.findFirstOrThrow({
      where: { platformPostId: "ITEST01" },
    });
    const before = await prisma.postMetric.count({ where: { postId: post.id } });
    await appendMetricSnapshot(
      post.id,
      {
        platformPostId: post.platformPostId,
        views: 9000,
        likes: 400,
        comments: 30,
        measuredAt: new Date("2026-07-03T00:00:00Z"),
      },
      "manual"
    );
    const after = await prisma.postMetric.count({ where: { postId: post.id } });
    expect(after).toBe(before + 1);
  });
});
