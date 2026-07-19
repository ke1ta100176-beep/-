import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runJob } from "@/server/jobs/jobRunner";
import { fetchPostsJob } from "@/server/jobs/fetchPosts";
import { computeScoresJob } from "@/server/jobs/computeScores";
import { analyzePostsJob } from "@/server/jobs/analyzePosts";
import { generateReportJob } from "@/server/jobs/generateReport";

/**
 * バックグラウンドジョブの起動エンドポイント（Webリクエストと分離した定期処理）。
 * スケジューラ（pg_cron+pg_net / Vercel Cron / 外部cron）から
 * Authorization: Bearer <CRON_SECRET> 付きで呼び出す。
 * 各ジョブは有界バッチで処理し、複数回の起動で全体を循環させる。
 */

const JOBS = {
  "fetch-posts": { type: "fetch_posts" as const, fn: fetchPostsJob },
  "compute-scores": { type: "compute_scores" as const, fn: computeScoresJob },
  "analyze-posts": { type: "analyze_posts" as const, fn: analyzePostsJob },
  "generate-report": { type: "generate_report" as const, fn: generateReportJob },
};

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

async function handleJobRequest(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { job } = await params;
  const jobDef = JOBS[job as keyof typeof JOBS];
  if (!jobDef) {
    return NextResponse.json(
      { error: `未知のジョブ: ${job}`, available: Object.keys(JOBS) },
      { status: 404 }
    );
  }

  const summary = await runJob(jobDef.type, "cron", async (ctx) => {
    await jobDef.fn(ctx);
  });

  // 部分失敗でも200を返す（スケジューラに全体リトライさせない）
  return NextResponse.json(summary, {
    status: summary.status === "failed" ? 500 : 200,
  });
}

export const POST = handleJobRequest;
// Vercel CronはGETで呼び出すため両対応にする（認証は共通のCRON_SECRET）
export const GET = handleJobRequest;
