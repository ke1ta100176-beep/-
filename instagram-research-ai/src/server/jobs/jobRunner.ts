import type { JobType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface JobContext {
  jobRunId: string;
  addSuccess: (n?: number) => void;
  addFailure: (error: string, n?: number) => void;
  addRetry: (n?: number) => void;
  addCost: (usd: number) => void;
  setApiUsed: (api: string) => void;
  setTargetCount: (n: number) => void;
}

export interface JobSummary {
  jobRunId: string;
  status: "success" | "partial" | "failed";
  targetCount: number;
  successCount: number;
  failureCount: number;
  errors: string[];
}

/**
 * ジョブ実行の共通ラッパー。JobRun 行の開始/終了・件数・エラー・コスト概算を記録する。
 * 個別アイテムの失敗はジョブ全体を落とさず partial として完了させる。
 */
export async function runJob(
  jobType: JobType,
  triggeredBy: string,
  fn: (ctx: JobContext) => Promise<void>
): Promise<JobSummary> {
  const jobRun = await prisma.jobRun.create({
    data: { jobType, triggeredBy, status: "running" },
  });

  let targetCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let retryCount = 0;
  let costUsd = 0;
  let apiUsed: string | undefined;
  const errors: string[] = [];

  const ctx: JobContext = {
    jobRunId: jobRun.id,
    addSuccess: (n = 1) => (successCount += n),
    addFailure: (error, n = 1) => {
      failureCount += n;
      if (errors.length < 50) errors.push(error.slice(0, 500));
    },
    addRetry: (n = 1) => (retryCount += n),
    addCost: (usd) => (costUsd += usd),
    setApiUsed: (api) => (apiUsed = api),
    setTargetCount: (n) => (targetCount = n),
  };

  let status: "success" | "partial" | "failed";
  try {
    await fn(ctx);
    status =
      failureCount === 0 ? "success" : successCount > 0 ? "partial" : "failed";
  } catch (error) {
    status = "failed";
    errors.push(
      error instanceof Error ? error.message.slice(0, 500) : String(error)
    );
  }

  await prisma.jobRun.update({
    where: { id: jobRun.id },
    data: {
      status,
      finishedAt: new Date(),
      targetCount,
      successCount,
      failureCount,
      retryCount,
      errors: errors.length > 0 ? errors : undefined,
      apiUsed,
      approxCostUsd: costUsd > 0 ? Math.round(costUsd * 10000) / 10000 : null,
    },
  });

  return { jobRunId: jobRun.id, status, targetCount, successCount, failureCount, errors };
}

/** アイテム単位の指数バックオフ付きリトライ */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; onRetry?: () => void } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelay = opts.baseDelayMs ?? 500;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        opts.onRetry?.();
        await new Promise((r) => setTimeout(r, baseDelay * 2 ** attempt));
      }
    }
  }
  throw lastError;
}
