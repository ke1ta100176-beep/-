import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/server/ai";
import { analyzePost } from "@/server/ai/analyzePost";
import type { JobContext } from "./jobRunner";

const BATCH_SIZE = 15;

/** 未分析投稿のAIタグ付けジョブ。失敗行があっても継続し、コストをJobRunへ記録する。 */
export async function analyzePostsJob(ctx: JobContext): Promise<void> {
  ctx.setApiUsed(getAIProvider().name);

  // 最新分析が存在しない投稿（未分析）を優先処理
  const posts = await prisma.post.findMany({
    where: {
      analyses: { none: { isLatest: true, status: { in: ["ok", "low_confidence"] } } },
      caption: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: BATCH_SIZE,
    select: { id: true },
  });
  ctx.setTargetCount(posts.length);

  for (const post of posts) {
    try {
      const result = await analyzePost(post.id);
      ctx.addCost(result.costUsd);
      if (result.status === "failed") {
        ctx.addFailure(`post ${post.id}: 分析失敗`);
      } else {
        ctx.addSuccess();
      }
    } catch (error) {
      ctx.addFailure(
        `post ${post.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
