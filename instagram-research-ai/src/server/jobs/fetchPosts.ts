import { prisma } from "@/lib/prisma";
import { getInstagramProvider } from "@/server/providers/instagram";
import { appendMetricSnapshot } from "@/server/services/metrics";
import type { JobContext } from "./jobRunner";
import { withRetry } from "./jobRunner";

const ACCOUNT_BATCH_SIZE = 20;
const POSTS_PER_ACCOUNT = 12;

/**
 * アカウント巡回ジョブ。lastCheckedAt が古い順に有界バッチで処理し、
 * 複数回の実行で全アカウントを循環させる（サーバーレス実行時間制限対策）。
 * 新規投稿の登録と既存投稿のメトリクス追記を行う。冪等。
 */
export async function fetchPostsJob(ctx: JobContext): Promise<void> {
  const provider = getInstagramProvider();
  ctx.setApiUsed(provider.sourceType);

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    take: ACCOUNT_BATCH_SIZE,
  });
  ctx.setTargetCount(accounts.length);

  for (const account of accounts) {
    try {
      await withRetry(
        async () => {
          // アカウント情報（フォロワー数）更新
          const accountData = await provider.fetchAccount({
            username: account.username,
          });
          await prisma.account.update({
            where: { id: account.id },
            data: {
              followersCount:
                accountData.followersCount ?? account.followersCount,
              displayName: accountData.displayName ?? account.displayName,
              lastCheckedAt: new Date(),
            },
          });

          const refs = await provider.fetchRecentPosts(
            { username: account.username },
            { limit: POSTS_PER_ACCOUNT }
          );

          for (const ref of refs) {
            const existing = await prisma.post.findUnique({
              where: {
                accountId_platformPostId: {
                  accountId: account.id,
                  platformPostId: ref.platformPostId,
                },
              },
            });

            let postId: string;
            if (!existing) {
              const details = await provider.fetchPostDetails(ref);
              const post = await prisma.post.create({
                data: {
                  accountId: account.id,
                  platformPostId: ref.platformPostId,
                  instagramUrl: ref.instagramUrl,
                  postedAt: details.postedAt ?? null,
                  caption: details.caption ?? null,
                  hashtags: details.hashtags ?? [],
                  audioName: details.audioName ?? null,
                  durationSeconds: details.durationSeconds ?? null,
                  sourceType: provider.sourceType,
                  fetchStatus: "ok",
                },
              });
              postId = post.id;
            } else {
              postId = existing.id;
            }

            const metrics = await provider.fetchPostMetrics(ref);
            // 履歴は常に追記（上書きしない）
            await appendMetricSnapshot(postId, metrics, provider.sourceType);
          }
        },
        { onRetry: () => ctx.addRetry() }
      );
      ctx.addSuccess();
    } catch (error) {
      ctx.addFailure(
        `account @${account.username}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
