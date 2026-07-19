import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** シェア受け口用トークンの発行・失効。平文は発行時に一度だけ返す。 */

export async function GET() {
  try {
    const user = await requireRole("member");
    const tokens = await prisma.ingestToken.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        label: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tokens });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({ label: z.string().max(60).optional() });

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("member");
    const body = createSchema.parse(await request.json().catch(() => ({})));

    const token = randomBytes(32).toString("base64url");
    const row = await prisma.ingestToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        label: body.label ?? "シェア用トークン",
      },
    });

    return NextResponse.json(
      {
        id: row.id,
        label: row.label,
        // 平文トークンはこのレスポンスでのみ返す（DBにはハッシュのみ保存）
        token,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

const revokeSchema = z.object({ id: z.string().min(1) });

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireRole("member");
    const body = revokeSchema.parse(await request.json());
    // 自分のトークンのみ失効可能
    const result = await prisma.ingestToken.updateMany({
      where: { id: body.id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "トークンが見つかりません" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
