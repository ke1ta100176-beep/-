import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PostFilter } from "@/lib/schemas/postFilters";

export type PostListItem = Prisma.PostGetPayload<{
  include: {
    account: { include: { category: true; benchmarkGroup: true } };
    latestMetric: true;
    analyses: { where: { isLatest: true } };
    scores: { where: { isLatest: true } };
  };
}>;

export interface PostListResult {
  posts: PostListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** フィルタ→Prisma where 変換。UI・API・AIチャットの検索が全てここを通る。 */
export function buildPostWhere(filter: PostFilter): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = {};
  const and: Prisma.PostWhereInput[] = [];

  if (filter.accountIds?.length) {
    and.push({ accountId: { in: filter.accountIds } });
  }
  if (filter.categorySlugs?.length) {
    and.push({ account: { category: { slug: { in: filter.categorySlugs } } } });
  }
  if (filter.benchmarkGroupSlugs?.length) {
    and.push({
      account: { benchmarkGroup: { slug: { in: filter.benchmarkGroupSlugs } } },
    });
  }
  if (filter.postedAfter) and.push({ postedAt: { gte: filter.postedAfter } });
  if (filter.postedBefore) and.push({ postedAt: { lte: filter.postedBefore } });
  if (filter.minFollowers !== undefined) {
    and.push({ account: { followersCount: { gte: filter.minFollowers } } });
  }
  if (filter.maxFollowers !== undefined) {
    and.push({ account: { followersCount: { lte: filter.maxFollowers } } });
  }
  if (filter.minViews !== undefined) {
    and.push({ latestMetric: { views: { gte: filter.minViews } } });
  }
  if (filter.maxViews !== undefined) {
    and.push({ latestMetric: { views: { lte: filter.maxViews } } });
  }
  if (filter.minDurationSeconds !== undefined) {
    and.push({ durationSeconds: { gte: filter.minDurationSeconds } });
  }
  if (filter.maxDurationSeconds !== undefined) {
    and.push({ durationSeconds: { lte: filter.maxDurationSeconds } });
  }
  if (filter.minTrendScore !== undefined) {
    and.push({ latestMetric: { trendScore: { gte: filter.minTrendScore } } });
  }
  if (filter.performanceClass) {
    and.push({
      latestMetric: { performanceClass: filter.performanceClass },
    });
  }
  if (filter.themes?.length) {
    and.push({
      analyses: { some: { isLatest: true, themes: { hasSome: filter.themes } } },
    });
  }
  if (filter.hookTypes?.length) {
    and.push({
      analyses: { some: { isLatest: true, hookType: { in: filter.hookTypes } } },
    });
  }
  if (filter.ctaTypes?.length) {
    and.push({
      analyses: { some: { isLatest: true, ctaType: { in: filter.ctaTypes } } },
    });
  }
  if (filter.mainGenre) {
    and.push({
      analyses: { some: { isLatest: true, mainGenre: filter.mainGenre } },
    });
  }
  if (filter.attributeContains) {
    for (const [key, value] of Object.entries(filter.attributeContains)) {
      and.push({
        analyses: {
          some: {
            isLatest: true,
            OR: [
              { attributes: { path: [key], string_contains: value } },
              { attributes: { path: [key], array_contains: [value] } },
            ],
          },
        },
      });
    }
  }
  if (filter.analyzed === true) {
    and.push({ analyses: { some: { isLatest: true, status: { not: "failed" } } } });
  }
  if (filter.analyzed === false) {
    and.push({
      NOT: { analyses: { some: { isLatest: true, status: { not: "failed" } } } },
    });
  }
  if (filter.freeText) {
    const q = filter.freeText;
    and.push({
      OR: [
        { caption: { contains: q, mode: "insensitive" } },
        { hashtags: { has: q } },
        { account: { username: { contains: q, mode: "insensitive" } } },
        {
          analyses: {
            some: {
              isLatest: true,
              OR: [
                { summary: { contains: q, mode: "insensitive" } },
                { themes: { has: q } },
              ],
            },
          },
        },
      ],
    });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

function buildOrderBy(
  filter: PostFilter
): Prisma.PostOrderByWithRelationInput[] {
  const dir = filter.sortOrder;
  switch (filter.sortBy) {
    case "trendScore":
      return [{ latestMetric: { trendScore: { sort: dir, nulls: "last" } } }];
    case "views":
      return [{ latestMetric: { views: { sort: dir, nulls: "last" } } }];
    case "viewsPerHour":
      return [{ latestMetric: { viewsPerHour: { sort: dir, nulls: "last" } } }];
    case "followerRatio":
      return [{ latestMetric: { followerRatio: { sort: dir, nulls: "last" } } }];
    case "postedAt":
      return [{ postedAt: { sort: dir, nulls: "last" } }];
    case "createdAt":
      return [{ createdAt: dir }];
  }
}

export async function queryPosts(filter: PostFilter): Promise<PostListResult> {
  const where = buildPostWhere(filter);
  const [posts, totalCount] = await Promise.all([
    prisma.post.findMany({
      where,
      include: {
        account: { include: { category: true, benchmarkGroup: true } },
        latestMetric: true,
        analyses: { where: { isLatest: true } },
        scores: { where: { isLatest: true } },
      },
      orderBy: buildOrderBy(filter),
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.post.count({ where }),
  ]);
  return { posts, totalCount, page: filter.page, pageSize: filter.pageSize };
}

export interface PostAggregates {
  totalCount: number;
  avgViews: number | null;
  medianViews: number | null;
  avgDurationSeconds: number | null;
  topThemes: { value: string; count: number }[];
  topHooks: { value: string; count: number }[];
  topCtas: { value: string; count: number }[];
  topAttributes: Record<string, { value: string; count: number }[]>;
  classCounts: Record<string, number>;
}

function topN(values: string[], n = 8): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** フィルタ条件に一致する投稿群の集計（コレクション集計・AIチャット・レポートで共用） */
export async function aggregatePosts(
  where: Prisma.PostWhereInput
): Promise<PostAggregates> {
  const posts = await prisma.post.findMany({
    where,
    include: {
      latestMetric: true,
      analyses: { where: { isLatest: true } },
    },
    take: 2000, // 集計対象の安全上限
  });

  const views = posts
    .map((p) => p.latestMetric?.views)
    .filter((v): v is number => v !== null && v !== undefined);
  const durations = posts
    .map((p) => p.durationSeconds)
    .filter((v): v is number => v !== null);

  const sortedViews = [...views].sort((a, b) => a - b);
  const medianViews =
    sortedViews.length === 0
      ? null
      : sortedViews.length % 2 === 0
        ? (sortedViews[sortedViews.length / 2 - 1] +
            sortedViews[sortedViews.length / 2]) /
          2
        : sortedViews[Math.floor(sortedViews.length / 2)];

  const analyses = posts.flatMap((p) => p.analyses);
  const attributeValues = new Map<string, string[]>();
  for (const a of analyses) {
    const attrs = a.attributes as Record<string, string | string[]> | null;
    if (!attrs) continue;
    for (const [key, value] of Object.entries(attrs)) {
      const list = attributeValues.get(key) ?? [];
      if (Array.isArray(value)) list.push(...value);
      else if (typeof value === "string") list.push(value);
      attributeValues.set(key, list);
    }
  }
  const topAttributes: Record<string, { value: string; count: number }[]> = {};
  for (const [key, values] of attributeValues.entries()) {
    topAttributes[key] = topN(values, 5);
  }

  const classCounts: Record<string, number> = {};
  for (const p of posts) {
    const cls = p.latestMetric?.performanceClass ?? "unscored";
    classCounts[cls] = (classCounts[cls] ?? 0) + 1;
  }

  return {
    totalCount: posts.length,
    avgViews:
      views.length > 0
        ? Math.round(views.reduce((a, b) => a + b, 0) / views.length)
        : null,
    medianViews,
    avgDurationSeconds:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
    topThemes: topN(analyses.flatMap((a) => a.themes)),
    topHooks: topN(analyses.map((a) => a.hookType ?? "")),
    topCtas: topN(analyses.map((a) => a.ctaType ?? "")),
    topAttributes,
    classCounts,
  };
}
