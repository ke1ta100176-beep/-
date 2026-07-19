import Papa from "papaparse";
import { z } from "zod";
import { parseInstagramUrl, type NormalizedPost } from "../types";

/**
 * CSVインポート。CSVはpush型（巡回取得なし）のため InstagramProvider の
 * fetch系は実装せず、行→共通データ形式への正規化のみを担う。
 */

const csvRowSchema = z.object({
  username: z.string().min(1, "username は必須です"),
  instagram_url: z.string().url("instagram_url が不正です"),
  posted_at: z.string().optional(),
  caption: z.string().optional(),
  hashtags: z.string().optional(),
  audio_name: z.string().optional(),
  duration_seconds: z.coerce.number().int().min(0).max(36000).optional(),
  followers_count: z.coerce.number().int().min(0).optional(),
  views: z.coerce.number().int().min(0).optional(),
  likes: z.coerce.number().int().min(0).optional(),
  comments: z.coerce.number().int().min(0).optional(),
  saves: z.coerce.number().int().min(0).optional(),
  shares: z.coerce.number().int().min(0).optional(),
  measured_at: z.string().optional(),
});

export type CsvRow = z.infer<typeof csvRowSchema>;

export interface CsvParseResult {
  posts: NormalizedPost[];
  errors: { row: number; message: string }[];
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseCsvImport(csvText: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const posts: NormalizedPost[] = [];
  const errors: { row: number; message: string }[] = [];

  parsed.data.forEach((raw, index) => {
    const rowNumber = index + 2; // ヘッダー行を考慮した実CSV行番号
    const result = csvRowSchema.safeParse(raw);
    if (!result.success) {
      errors.push({
        row: rowNumber,
        message: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }
    const row = result.data;
    const urlInfo = parseInstagramUrl(row.instagram_url);
    if (!urlInfo) {
      errors.push({
        row: rowNumber,
        message: "instagram_url がInstagram投稿URLの形式ではありません",
      });
      return;
    }

    const measuredAt = parseDate(row.measured_at) ?? new Date();
    const hasMetrics =
      row.views !== undefined ||
      row.likes !== undefined ||
      row.comments !== undefined;

    posts.push({
      account: {
        username: row.username,
        profileUrl: `https://www.instagram.com/${row.username}/`,
        followersCount: row.followers_count,
      },
      details: {
        username: row.username,
        platformPostId: urlInfo.platformPostId,
        instagramUrl: urlInfo.canonicalUrl,
        postedAt: parseDate(row.posted_at),
        caption: row.caption,
        hashtags: row.hashtags
          ? row.hashtags
              .split(/[\s,]+/)
              .map((h) => (h.startsWith("#") ? h : `#${h}`))
              .filter((h) => h.length > 1)
          : undefined,
        audioName: row.audio_name,
        durationSeconds: row.duration_seconds,
      },
      metrics: hasMetrics
        ? {
            platformPostId: urlInfo.platformPostId,
            views: row.views,
            likes: row.likes,
            comments: row.comments,
            saves: row.saves,
            shares: row.shares,
            followersCount: row.followers_count,
            measuredAt,
          }
        : undefined,
    });
  });

  return { posts, errors };
}
