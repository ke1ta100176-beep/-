import { prisma } from "@/lib/prisma";
import { getInstagramProvider } from "@/server/providers/instagram";
import {
  parseInstagramUrl,
  type NormalizedPost,
} from "@/server/providers/instagram/types";
import { appendMetricSnapshot } from "./metrics";

export interface IngestResult {
  postId: string;
  created: boolean;
  accountCreated: boolean;
}

/**
 * URL1件の取り込み（シェア受け口・手動登録の共通経路）。
 * 冪等: 既存投稿（accountId+platformPostId）なら新規作成せずメトリクス再取得のみ。
 */
export async function ingestPostUrl(
  url: string,
  opts: {
    sourceType: "manual" | "share";
    username?: string;
    autoAnalyze?: boolean;
  }
): Promise<IngestResult> {
  const urlInfo = parseInstagramUrl(url);
  if (!urlInfo) {
    throw new Error(
      "Instagram投稿URLの形式ではありません（https://www.instagram.com/reel/... 等）"
    );
  }

  // 既存投稿チェック（platformPostIdはInstagram全体で一意なshortcode）
  const existing = await prisma.post.findFirst({
    where: { platformPostId: urlInfo.platformPostId },
  });
  if (existing) {
    await tryFetchMetrics(existing.id, existing.platformPostId, existing.instagramUrl, opts.sourceType);
    return { postId: existing.id, created: false, accountCreated: false };
  }

  // アカウント特定: 指定があればそれ、なければProviderで解決を試みる
  const provider = getInstagramProvider();
  let username = opts.username;
  let accountData: Awaited<ReturnType<typeof provider.fetchAccount>> | null = null;

  if (username) {
    accountData = await provider.fetchAccount({ username }).catch(() => null);
  }

  let details: NormalizedPost["details"] | null = null;
  try {
    details = await provider.fetchPostDetails({
      username: username ?? "",
      platformPostId: urlInfo.platformPostId,
      instagramUrl: urlInfo.canonicalUrl,
    });
    username = username ?? details.username;
    if (!accountData && username) {
      accountData = await provider.fetchAccount({ username }).catch(() => null);
    }
  } catch {
    // Provider未対応・取得失敗でもURLだけで登録は成立させ、後から補完する
  }

  if (!username) {
    username = "_unknown"; // アカウント不明の投稿の受け皿（後から編集で付け替え可能）
  }

  let accountCreated = false;
  const account = await prisma.account.upsert({
    where: { username },
    update: accountData?.followersCount
      ? { followersCount: accountData.followersCount, lastCheckedAt: new Date() }
      : {},
    create: {
      username,
      displayName: accountData?.displayName ?? username,
      profileUrl:
        accountData?.profileUrl ?? `https://www.instagram.com/${username}/`,
      followersCount: accountData?.followersCount ?? 0,
      // シェア経由の未知アカウントは無効状態で仮登録し、後から有効化する
      isActive: opts.sourceType !== "share",
      sourceType: opts.sourceType,
    },
  });
  accountCreated = account.createdAt.getTime() > Date.now() - 5000;

  const post = await prisma.post.create({
    data: {
      accountId: account.id,
      platformPostId: urlInfo.platformPostId,
      instagramUrl: urlInfo.canonicalUrl,
      postedAt: details?.postedAt ?? null,
      caption: details?.caption ?? null,
      hashtags: details?.hashtags ?? [],
      audioName: details?.audioName ?? null,
      durationSeconds: details?.durationSeconds ?? null,
      sourceType: opts.sourceType,
      fetchStatus: details ? "ok" : "pending",
    },
  });

  await tryFetchMetrics(post.id, post.platformPostId, post.instagramUrl, opts.sourceType);

  return { postId: post.id, created: true, accountCreated };
}

async function tryFetchMetrics(
  postId: string,
  platformPostId: string,
  instagramUrl: string,
  sourceType: "manual" | "share"
): Promise<void> {
  const provider = getInstagramProvider();
  try {
    const metrics = await provider.fetchPostMetrics({
      username: "",
      platformPostId,
      instagramUrl,
    });
    await appendMetricSnapshot(postId, metrics, sourceType);
  } catch {
    // メトリクス取得失敗は致命的でない。fetch_statusはpendingのまま次回巡回で再試行。
  }
}

/** CSVインポート正規化済みデータの一括登録（冪等・履歴は常に追記） */
export async function importNormalizedPosts(
  posts: NormalizedPost[],
  sourceType: "csv"
): Promise<{ created: number; updated: number; metricsAppended: number }> {
  let created = 0;
  let updated = 0;
  let metricsAppended = 0;

  for (const item of posts) {
    const account = await prisma.account.upsert({
      where: { username: item.account.username },
      update:
        item.account.followersCount !== undefined
          ? { followersCount: item.account.followersCount }
          : {},
      create: {
        username: item.account.username,
        displayName: item.account.displayName ?? item.account.username,
        profileUrl: item.account.profileUrl,
        followersCount: item.account.followersCount ?? 0,
        sourceType,
      },
    });

    const existing = await prisma.post.findUnique({
      where: {
        accountId_platformPostId: {
          accountId: account.id,
          platformPostId: item.details.platformPostId,
        },
      },
    });

    let postId: string;
    if (existing) {
      // メタデータは新しい情報があれば補完更新（数値はここでは触らない）
      await prisma.post.update({
        where: { id: existing.id },
        data: {
          caption: item.details.caption ?? existing.caption,
          postedAt: item.details.postedAt ?? existing.postedAt,
          hashtags:
            item.details.hashtags && item.details.hashtags.length > 0
              ? item.details.hashtags
              : existing.hashtags,
          audioName: item.details.audioName ?? existing.audioName,
          durationSeconds:
            item.details.durationSeconds ?? existing.durationSeconds,
        },
      });
      postId = existing.id;
      updated++;
    } else {
      const post = await prisma.post.create({
        data: {
          accountId: account.id,
          platformPostId: item.details.platformPostId,
          instagramUrl: item.details.instagramUrl,
          postedAt: item.details.postedAt ?? null,
          caption: item.details.caption ?? null,
          hashtags: item.details.hashtags ?? [],
          audioName: item.details.audioName ?? null,
          durationSeconds: item.details.durationSeconds ?? null,
          sourceType,
          fetchStatus: "ok",
        },
      });
      postId = post.id;
      created++;
    }

    if (item.metrics) {
      // 同一投稿の再インポートでも履歴は上書きせず追記される
      await appendMetricSnapshot(postId, item.metrics, sourceType);
      metricsAppended++;
    }
  }

  return { created, updated, metricsAppended };
}
