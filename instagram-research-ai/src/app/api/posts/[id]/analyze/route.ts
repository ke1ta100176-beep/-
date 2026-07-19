import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzePost } from "@/server/ai/analyzePost";

const analyzeSchema = z.object({
  /** 手動入力の文字起こし（あれば分析精度が上がる） */
  transcript: z.string().max(10_000).optional(),
});

/** AIタグ付けの実行・再実行。失敗した分析のリトライにも使う。 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("member");
    const { id } = await params;
    const body = analyzeSchema.parse(await request.json().catch(() => ({})));

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "投稿が見つかりません" }, { status: 404 });
    }

    const result = await analyzePost(id, { transcript: body.transcript });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
