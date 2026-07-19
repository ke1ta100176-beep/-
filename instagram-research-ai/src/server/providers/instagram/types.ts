/**
 * Instagramデータ取得の抽象化レイヤー。
 * 実際の取得方法（モック/CSV/外部スクレイピングサービス）は未確定のため、
 * このインターフェースの背後に隔離し、後から差し替え可能にする。
 * 注意: 本MVPは自動スクレイピングを実装しない（法的リスク評価はREADME参照）。
 */

export type ProviderSourceType = "mock" | "csv" | "share" | "scraping_api";

export interface RawAccountData {
  username: string;
  displayName?: string;
  profileUrl?: string;
  followersCount?: number;
}

export interface RawPostRef {
  username: string;
  platformPostId: string;
  instagramUrl: string;
}

export interface RawPostDetails extends RawPostRef {
  postedAt?: Date;
  caption?: string;
  hashtags?: string[];
  audioName?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

export interface RawPostMetrics {
  platformPostId: string;
  views?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  followersCount?: number;
  measuredAt: Date;
}

export interface NormalizedPost {
  account: RawAccountData;
  details: RawPostDetails;
  metrics?: RawPostMetrics;
}

export class ProviderNotSupportedError extends Error {
  constructor(operation: string, provider: string) {
    super(`${provider} provider does not support ${operation}`);
    this.name = "ProviderNotSupportedError";
  }
}

export interface InstagramProvider {
  readonly sourceType: ProviderSourceType;
  fetchAccount(input: { username: string }): Promise<RawAccountData>;
  fetchRecentPosts(
    account: { username: string },
    opts?: { since?: Date; limit?: number }
  ): Promise<RawPostRef[]>;
  fetchPostDetails(ref: RawPostRef): Promise<RawPostDetails>;
  fetchPostMetrics(ref: RawPostRef): Promise<RawPostMetrics>;
}

const INSTAGRAM_URL_PATTERN =
  /^https:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/([A-Za-z0-9_-]+)\/?/;

/** Instagram投稿URLからplatformPostId（shortcode）を抽出。不正URLはnull。 */
export function parseInstagramUrl(
  url: string
): { platformPostId: string; canonicalUrl: string } | null {
  const match = url.trim().match(INSTAGRAM_URL_PATTERN);
  if (!match) return null;
  const kind = match[2];
  const shortcode = match[3];
  return {
    platformPostId: shortcode,
    canonicalUrl: `https://www.instagram.com/${kind}/${shortcode}/`,
  };
}
