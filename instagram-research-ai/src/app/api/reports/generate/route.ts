import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { runJob } from "@/server/jobs/jobRunner";
import { generateReportJob } from "@/server/jobs/generateReport";

/** 画面からの手動レポート生成（定期実行は /api/internal/jobs/generate-report） */
export async function POST() {
  try {
    const user = await requireRole("member");
    const summary = await runJob("generate_report", `user:${user.id}`, async (ctx) => {
      await generateReportJob(ctx);
    });
    return NextResponse.json(summary, {
      status: summary.status === "failed" ? 500 : 200,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
