import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveScoringPolicy } from "@/server/scoring/config";

/** 設定の取得。APIキーは値を返さず設定済みかどうかのみ返す（マスク表示）。 */
export async function GET() {
  try {
    await requireRole("viewer");
    const [settings, scoringPolicy, scoringVersions] = await Promise.all([
      prisma.appSetting.findMany(),
      getActiveScoringPolicy(),
      prisma.scoringConfig.findMany({
        orderBy: { version: "desc" },
        take: 10,
        select: {
          version: true,
          isActive: true,
          note: true,
          createdAt: true,
          createdBy: true,
        },
      }),
    ]);

    return NextResponse.json({
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      scoringPolicy,
      scoringVersions,
      env: {
        aiProvider: process.env.AI_PROVIDER ?? "anthropic",
        aiModel: process.env.AI_MODEL ?? "claude-sonnet-5",
        anthropicKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
        dataSource: process.env.DATA_SOURCE ?? "mock",
        timezone: process.env.APP_TIMEZONE ?? "Asia/Tokyo",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  key: z.enum([
    "ai_model",
    "fetch_schedule",
    "notification_settings",
    "timezone",
  ]),
  value: z.unknown(),
});

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireRole("admin");
    const body = patchSchema.parse(await request.json());
    const setting = await prisma.appSetting.upsert({
      where: { key: body.key },
      update: { value: body.value as object, updatedBy: user.id },
      create: {
        key: body.key,
        value: body.value as object,
        updatedBy: user.id,
      },
    });
    return NextResponse.json({ setting });
  } catch (error) {
    return handleApiError(error);
  }
}
