import { z } from "zod";

/**
 * 投稿検索フィルタ。投稿一覧UI・API・AIチャットのqueryPostsツールで共有し、
 * 「UIで絞り込めるもの＝チャットで質問できるもの」の一貫性を保つ。
 */
export const postFilterSchema = z.object({
  accountIds: z.array(z.string()).optional(),
  categorySlugs: z.array(z.string()).optional(),
  benchmarkGroupSlugs: z.array(z.string()).optional(),
  postedAfter: z.coerce.date().optional(),
  postedBefore: z.coerce.date().optional(),
  minFollowers: z.coerce.number().int().min(0).optional(),
  maxFollowers: z.coerce.number().int().min(0).optional(),
  minViews: z.coerce.number().int().min(0).optional(),
  maxViews: z.coerce.number().int().min(0).optional(),
  minDurationSeconds: z.coerce.number().int().min(0).optional(),
  maxDurationSeconds: z.coerce.number().int().min(0).optional(),
  themes: z.array(z.string()).optional(),
  hookTypes: z.array(z.string()).optional(),
  ctaTypes: z.array(z.string()).optional(),
  mainGenre: z.string().optional(),
  /** ジャンル固有属性の部分一致検索（例: {"ingredients": "そうめん"}） */
  attributeContains: z.record(z.string(), z.string()).optional(),
  performanceClass: z
    .enum(["grew", "normal", "underperformed", "too_early", "insufficient_data"])
    .optional(),
  analyzed: z.boolean().optional(),
  minTrendScore: z.coerce.number().min(0).max(100).optional(),
  freeText: z.string().max(200).optional(),
  sortBy: z
    .enum([
      "trendScore",
      "postedAt",
      "views",
      "viewsPerHour",
      "followerRatio",
      "createdAt",
    ])
    .default("trendScore"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export type PostFilter = z.infer<typeof postFilterSchema>;
