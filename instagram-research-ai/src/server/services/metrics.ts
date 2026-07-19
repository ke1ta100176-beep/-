import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RawPostMetrics } from "@/server/providers/instagram/types";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * 数値スナップショットを追記する（唯一の書き込み経路）。
 * PostMetric は追記専用: このモジュール以外から作成せず、UPDATE は行わない。
 * PostLatestMetric は一覧表示用の派生キャッシュとしてここで同時更新する。
 */
export async function appendMetricSnapshot(
  postId: string,
  metrics: RawPostMetrics,
  sourceType: "mock" | "csv" | "manual" | "share" | "scraping_api",
  tx: Tx = prisma
): Promise<void> {
  const post = await tx.post.findUniqueOrThrow({
    where: { id: postId },
    select: { postedAt: true },
  });

  const hoursSincePosted = post.postedAt
    ? (metrics.measuredAt.getTime() - post.postedAt.getTime()) / 3600_000
    : null;

  // 直前のスナップショット（差分計算用）
  const prev = await tx.postMetric.findFirst({
    where: { postId, fetchStatus: "ok" },
    orderBy: { measuredAt: "desc" },
  });

  await tx.postMetric.create({
    data: {
      postId,
      views: metrics.views ?? null,
      likes: metrics.likes ?? null,
      comments: metrics.comments ?? null,
      saves: metrics.saves ?? null,
      shares: metrics.shares ?? null,
      followersCount: metrics.followersCount ?? null,
      hoursSincePosted,
      measuredAt: metrics.measuredAt,
      sourceType,
      fetchStatus: "ok",
    },
  });

  // 派生キャッシュ更新（真実のソースは PostMetric、ここは再構築可能な最新値）
  let viewsDelta: number | null = null;
  let viewsPerHour: number | null = null;
  let growthRate: number | null = null;

  if (
    prev &&
    prev.views !== null &&
    metrics.views !== undefined &&
    prev.measuredAt < metrics.measuredAt
  ) {
    viewsDelta = metrics.views - prev.views;
    const hoursBetween =
      (metrics.measuredAt.getTime() - prev.measuredAt.getTime()) / 3600_000;
    if (hoursBetween > 0) viewsPerHour = Math.max(0, viewsDelta) / hoursBetween;
    if (prev.views > 0) growthRate = viewsDelta / prev.views;
  } else if (
    metrics.views !== undefined &&
    hoursSincePosted !== null &&
    hoursSincePosted > 0
  ) {
    viewsPerHour = metrics.views / hoursSincePosted;
  }

  const followerRatio =
    metrics.views !== undefined && metrics.followersCount
      ? metrics.views / Math.max(1, metrics.followersCount)
      : null;

  await tx.postLatestMetric.upsert({
    where: { postId },
    create: {
      postId,
      views: metrics.views ?? null,
      likes: metrics.likes ?? null,
      comments: metrics.comments ?? null,
      saves: metrics.saves ?? null,
      shares: metrics.shares ?? null,
      followersCount: metrics.followersCount ?? null,
      viewsDelta,
      viewsPerHour,
      growthRate,
      followerRatio,
      measuredAt: metrics.measuredAt,
    },
    update: {
      views: metrics.views ?? null,
      likes: metrics.likes ?? null,
      comments: metrics.comments ?? null,
      saves: metrics.saves ?? null,
      shares: metrics.shares ?? null,
      followersCount: metrics.followersCount ?? null,
      viewsDelta,
      viewsPerHour,
      growthRate,
      followerRatio,
      measuredAt: metrics.measuredAt,
    },
  });

  await tx.post.update({
    where: { id: postId },
    data: {
      lastFetchedAt: metrics.measuredAt,
      firstFetchedAt: prev ? undefined : metrics.measuredAt,
      fetchStatus: "ok",
    },
  });
}
