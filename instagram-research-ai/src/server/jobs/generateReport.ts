import { prisma } from "@/lib/prisma";
import { aggregatePosts } from "@/server/db/repositories/postsRepo";
import type { JobContext } from "./jobRunner";

/**
 * 日次レポート生成ジョブ。前日追加投稿・急上昇投稿・増加テーマ等を集計し
 * Report 行として保存する（MVPはアプリ内表示のみ、外部通知は将来対応）。
 */
export async function generateReportJob(
  ctx: JobContext,
  targetDate = new Date()
): Promise<string> {
  ctx.setTargetCount(1);

  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(dayStart.getTime() - 24 * 3600 * 1000);
  const twoWeeksAgo = new Date(dayStart.getTime() - 14 * 24 * 3600 * 1000);

  const [addedYesterday, addedToday, trendingPosts, errorCount] =
    await Promise.all([
      prisma.post.count({
        where: { createdAt: { gte: yesterdayStart, lt: dayStart } },
      }),
      prisma.post.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.post.findMany({
        where: { latestMetric: { trendScore: { gte: 50 } } },
        include: {
          account: true,
          latestMetric: true,
          analyses: { where: { isLatest: true } },
        },
        orderBy: { latestMetric: { trendScore: "desc" } },
        take: 12,
      }),
      prisma.post.count({ where: { fetchStatus: "failed" } }),
    ]);

  // 直近14日の伸びた投稿群からテーマ・属性の頻度を集計
  const recentGrewAggregates = await aggregatePosts({
    postedAt: { gte: twoWeeksAgo },
    latestMetric: { performanceClass: "grew" },
  });

  // 小規模アカウント（フォロワー3万人以下）の急上昇
  const smallAccountRisers = await prisma.post.findMany({
    where: {
      account: { followersCount: { lte: 30_000 } },
      latestMetric: { trendScore: { gte: 40 } },
    },
    include: { account: true, latestMetric: true },
    orderBy: { latestMetric: { trendScore: "desc" } },
    take: 5,
  });

  const reportJson = {
    addedYesterday,
    addedToday,
    trendingCount: trendingPosts.length,
    trendingPostIds: trendingPosts.map((p) => p.id),
    trendingThemes: recentGrewAggregates.topThemes,
    trendingHooks: recentGrewAggregates.topHooks,
    trendingAttributes: recentGrewAggregates.topAttributes,
    smallAccountRiserIds: smallAccountRisers.map((p) => p.id),
    fetchErrorCount: errorCount,
  };

  const themeText = recentGrewAggregates.topThemes
    .slice(0, 5)
    .map((t) => `- ${t.value}（${t.count}件）`)
    .join("\n");

  const reportText = `昨日追加された投稿: ${addedYesterday}件
本日追加された投稿: ${addedToday}件
急上昇投稿: ${trendingPosts.length}件
データ取得エラー: ${errorCount}件

最近増えているテーマ（直近14日・伸びた投稿群）:
${themeText || "- データ不足"}

注目: 小規模アカウント（3万人以下）の急上昇 ${smallAccountRisers.length}件`;

  const report = await prisma.report.create({
    data: {
      reportType: "daily",
      targetDate: dayStart,
      dateRangeStart: yesterdayStart,
      dateRangeEnd: targetDate,
      reportJson,
      reportText,
    },
  });

  ctx.addSuccess();
  return report.id;
}
