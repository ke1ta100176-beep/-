/**
 * CLIからのジョブ実行（開発・手動運用向け）。
 * 使い方: npx tsx scripts/runJob.ts <fetch-posts|compute-scores|analyze-posts|generate-report>
 * 本番の定期実行は /api/internal/jobs/* をスケジューラから呼ぶ（README参照）。
 */
import { runJob } from "../src/server/jobs/jobRunner";
import { fetchPostsJob } from "../src/server/jobs/fetchPosts";
import { computeScoresJob } from "../src/server/jobs/computeScores";
import { analyzePostsJob } from "../src/server/jobs/analyzePosts";
import { generateReportJob } from "../src/server/jobs/generateReport";

const JOBS = {
  "fetch-posts": { type: "fetch_posts" as const, fn: fetchPostsJob },
  "compute-scores": { type: "compute_scores" as const, fn: computeScoresJob },
  "analyze-posts": { type: "analyze_posts" as const, fn: analyzePostsJob },
  "generate-report": { type: "generate_report" as const, fn: generateReportJob },
};

async function main() {
  const jobName = process.argv[2] as keyof typeof JOBS | undefined;
  if (!jobName || !JOBS[jobName]) {
    console.error(`使い方: tsx scripts/runJob.ts <${Object.keys(JOBS).join("|")}>`);
    process.exit(1);
  }
  const job = JOBS[jobName];
  console.log(`▶ ${jobName} を実行します...`);
  const summary = await runJob(job.type, "cli", async (ctx) => {
    await job.fn(ctx);
  });
  console.log(
    `✔ ${jobName}: ${summary.status}（対象${summary.targetCount} 成功${summary.successCount} 失敗${summary.failureCount}）`
  );
  if (summary.errors.length > 0) {
    console.log("エラー:", summary.errors.slice(0, 5));
  }
  process.exit(summary.status === "failed" ? 1 : 0);
}

main();
