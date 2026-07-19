import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SCORING_POLICY,
  type ClassificationThresholds,
  type ScoringPolicy,
  type TrendScoreNorms,
  type TrendScoreWeights,
} from "./types";

let cached: { policy: ScoringPolicy; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

/** アクティブなスコアリングポリシーをDBから取得（短TTLキャッシュ）。なければデフォルトを登録。 */
export async function getActiveScoringPolicy(): Promise<ScoringPolicy> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.policy;

  let row = await prisma.scoringConfig.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });

  if (!row) {
    row = await prisma.scoringConfig.upsert({
      where: { version: DEFAULT_SCORING_POLICY.version },
      update: { isActive: true },
      create: {
        version: DEFAULT_SCORING_POLICY.version,
        weights: DEFAULT_SCORING_POLICY.weights as object,
        classificationThresholds:
          DEFAULT_SCORING_POLICY.classificationThresholds as object,
        isActive: true,
        note: "初期デフォルトポリシー",
      },
    });
  }

  const policy: ScoringPolicy = {
    version: row.version,
    weights: row.weights as unknown as TrendScoreWeights & TrendScoreNorms,
    classificationThresholds:
      row.classificationThresholds as unknown as ClassificationThresholds,
  };
  cached = { policy, at: Date.now() };
  return policy;
}

/** 設定編集時は既存行を変更せず新バージョン行を作成する（過去スコアの再現性維持）。 */
export async function createScoringPolicyVersion(
  weights: TrendScoreWeights & TrendScoreNorms,
  classificationThresholds: ClassificationThresholds,
  createdBy: string,
  note?: string
): Promise<ScoringPolicy> {
  const latest = await prisma.scoringConfig.findFirst({
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;
  const row = await prisma.$transaction(async (tx) => {
    await tx.scoringConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    return tx.scoringConfig.create({
      data: {
        version,
        weights: weights as object,
        classificationThresholds: classificationThresholds as object,
        isActive: true,
        createdBy,
        note,
      },
    });
  });
  cached = null;
  return {
    version: row.version,
    weights,
    classificationThresholds,
  };
}

export function invalidateScoringPolicyCache() {
  cached = null;
}
