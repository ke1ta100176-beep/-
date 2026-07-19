import { prisma } from "@/lib/prisma";
import {
  classifyPerformance,
  excludeOutliers,
  median,
} from "@/server/scoring/classification";
import { getActiveScoringPolicy } from "@/server/scoring/config";
import { computeTrendScore } from "@/server/scoring/trendScore";
import type { JobContext } from "./jobRunner";

const BATCH_SIZE = 300;

/**
 * スコア再計算ジョブ。
 * 最新スナップショットからトレンドスコアと成功/伸び悩み分類を計算し、
 * PostScore へ追記（isLatestフリップ）、PostLatestMetric キャッシュへ複製する。
 */
export async function computeScoresJob(ctx: JobContext): Promise<void> {
  const policy = await getActiveScoringPolicy();

  // 未スコアの投稿を優先し、残り枠は既存スコアの古い順に再計算する
  const include = {
    latestMetric: true,
    account: {
      select: { id: true, categoryId: true, followersCount: true },
    },
  } as const;
  const unscored = await prisma.post.findMany({
    where: { latestMetric: { isNot: null }, scores: { none: { isLatest: true } } },
    include,
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });
  const rescoreBudget = BATCH_SIZE - unscored.length;
  const stale =
    rescoreBudget > 0
      ? await prisma.post.findMany({
          where: {
            latestMetric: { isNot: null },
            scores: { some: { isLatest: true } },
            id: { notIn: unscored.map((p) => p.id) },
          },
          include,
          orderBy: { updatedAt: "asc" },
          take: rescoreBudget,
        })
      : [];
  const posts = [...unscored, ...stale];
  ctx.setTargetCount(posts.length);

  // カテゴリ別中央値（サンプル不足アカウントのフォールバック用）を先に計算
  const categoryMedians = await computeCategoryMedians();

  for (const post of posts) {
    try {
      const latest = post.latestMetric;
      if (!latest) continue;

      const snapshots = await prisma.postMetric.findMany({
        where: { postId: post.id, fetchStatus: "ok" },
        orderBy: { measuredAt: "desc" },
        take: 2,
      });
      const current = snapshots[0];
      const prev = snapshots[1] ?? null;
      if (!current) continue;

      const hoursSincePosted = post.postedAt
        ? (current.measuredAt.getTime() - post.postedAt.getTime()) / 3600_000
        : null;

      // 同一アカウントの過去投稿（この投稿を除く）の最新値
      const accountPosts = await prisma.post.findMany({
        where: {
          accountId: post.account.id,
          id: { not: post.id },
          latestMetric: { views: { not: null } },
        },
        include: { latestMetric: true },
        orderBy: { postedAt: { sort: "desc", nulls: "last" } },
        take: policy.classificationThresholds.trailingWindow,
      });
      const history = accountPosts
        .filter((p) => p.latestMetric?.views != null)
        .map((p) => ({
          views: p.latestMetric?.views as number,
          followersCount: p.latestMetric?.followersCount ?? null,
        }));

      const accountViewValues = excludeOutliers(
        history.map((h) => h.views),
        policy.classificationThresholds.madOutlierFactor
      );
      const accountMedianViews = median(accountViewValues);

      const hoursBetween =
        prev && current.measuredAt > prev.measuredAt
          ? (current.measuredAt.getTime() - prev.measuredAt.getTime()) / 3600_000
          : null;

      const score = computeTrendScore(
        {
          views: current.views,
          prevViews: prev?.views ?? null,
          hoursBetweenSnapshots: hoursBetween,
          hoursSincePosted,
          followersCount: current.followersCount ?? post.account.followersCount,
          accountMedianViews,
        },
        policy
      );

      const classification = classifyPerformance(
        {
          views: current.views,
          hoursSincePosted,
          followersCount: current.followersCount ?? post.account.followersCount,
          accountHistory: history,
          categoryMedianViews: post.account.categoryId
            ? (categoryMedians.get(post.account.categoryId) ?? null)
            : null,
        },
        policy.classificationThresholds
      );

      await prisma.$transaction(async (tx) => {
        await tx.postScore.updateMany({
          where: { postId: post.id, isLatest: true },
          data: { isLatest: false },
        });
        await tx.postScore.create({
          data: {
            postId: post.id,
            trendScore: score.trendScore,
            velocityScore: score.velocityScore,
            growthScore: score.growthScore,
            followerRatioScore: score.followerRatioScore,
            freshnessScore: score.freshnessScore,
            accountBaselineScore: score.accountBaselineScore,
            performanceClass: classification.performanceClass,
            baselineSource: classification.baselineSource,
            rawBreakdown: {
              ...score.breakdown,
              classificationRatio: classification.ratio,
              baselineViews: classification.baselineViews,
              followerNormalized: classification.followerNormalized,
            },
            calculationVersion: policy.version,
            isLatest: true,
          },
        });
        await tx.postLatestMetric.update({
          where: { postId: post.id },
          data: {
            trendScore: score.trendScore,
            performanceClass: classification.performanceClass,
          },
        });
      });
      ctx.addSuccess();
    } catch (error) {
      ctx.addFailure(
        `post ${post.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function computeCategoryMedians(): Promise<Map<string, number>> {
  const posts = await prisma.post.findMany({
    where: {
      latestMetric: { views: { not: null } },
      account: { categoryId: { not: null } },
    },
    select: {
      latestMetric: { select: { views: true } },
      account: { select: { categoryId: true } },
    },
    take: 5000,
  });
  const byCategory = new Map<string, number[]>();
  for (const p of posts) {
    const catId = p.account.categoryId;
    const views = p.latestMetric?.views;
    if (!catId || views == null) continue;
    const list = byCategory.get(catId) ?? [];
    list.push(views);
    byCategory.set(catId, list);
  }
  const medians = new Map<string, number>();
  for (const [catId, views] of byCategory.entries()) {
    const m = median(views);
    if (m !== null) medians.set(catId, m);
  }
  return medians;
}
