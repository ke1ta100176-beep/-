import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { createScoringPolicyVersion } from "@/server/scoring/config";

const weightsSchema = z.object({
  velocity: z.number().min(0).max(1),
  growth: z.number().min(0).max(1),
  followerRatio: z.number().min(0).max(1),
  accountBaseline: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  velocityNorm: z.number().positive(),
  growthCap: z.number().positive(),
  followerRatioNorm: z.number().positive(),
  baselineDeltaCap: z.number().positive(),
  freshnessWindowHours: z.number().positive(),
});

const thresholdsSchema = z.object({
  grewRatio: z.number().positive(),
  underperformRatio: z.number().positive(),
  minElapsedHours: z.number().min(0),
  minSampleSize: z.number().int().min(1),
  trailingWindow: z.number().int().min(3).max(100),
  followerDriftRatio: z.number().min(0).max(1),
  madOutlierFactor: z.number().positive(),
});

const bodySchema = z.object({
  weights: weightsSchema,
  classificationThresholds: thresholdsSchema,
  note: z.string().max(300).optional(),
});

/**
 * スコアリングポリシーの新バージョン作成。
 * 既存バージョンは変更されず、過去スコアの calculationVersion 参照が保たれる。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("admin");
    const body = bodySchema.parse(await request.json());

    const weightSum =
      body.weights.velocity +
      body.weights.growth +
      body.weights.followerRatio +
      body.weights.accountBaseline +
      body.weights.freshness;
    if (Math.abs(weightSum - 1) > 0.01) {
      return NextResponse.json(
        { error: `重みの合計は1にしてください（現在: ${weightSum.toFixed(2)}）` },
        { status: 400 }
      );
    }
    if (body.classificationThresholds.underperformRatio >= body.classificationThresholds.grewRatio) {
      return NextResponse.json(
        { error: "伸び悩みしきい値は「伸びた」しきい値より小さくしてください" },
        { status: 400 }
      );
    }

    const policy = await createScoringPolicyVersion(
      body.weights,
      body.classificationThresholds,
      user.id,
      body.note
    );
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
