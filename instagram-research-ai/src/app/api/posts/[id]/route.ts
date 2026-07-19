import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("viewer");
    const { id } = await params;
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        account: { include: { category: true, benchmarkGroup: true } },
        latestMetric: true,
        metrics: { orderBy: { measuredAt: "asc" } },
        analyses: { orderBy: { analyzedAt: "desc" }, take: 5 },
        scores: { where: { isLatest: true } },
        collections: { include: { collection: true } },
      },
    });
    if (!post) {
      return NextResponse.json({ error: "投稿が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (error) {
    return handleApiError(error);
  }
}
