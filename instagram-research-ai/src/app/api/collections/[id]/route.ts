import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregatePosts } from "@/server/db/repositories/postsRepo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("viewer");
    const { id } = await params;
    const collection = await prisma.collection.findUnique({
      where: { id },
      include: {
        posts: {
          include: {
            post: {
              include: {
                account: true,
                latestMetric: true,
                analyses: { where: { isLatest: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!collection) {
      return NextResponse.json(
        { error: "コレクションが見つかりません" },
        { status: 404 }
      );
    }

    // コレクション内投稿の集計（伸びた/伸びなかった投稿の共通点比較を含む）
    const postIds = collection.posts.map((cp) => cp.postId);
    const [aggregates, grewAggregates, underperformedAggregates] =
      postIds.length > 0
        ? await Promise.all([
            aggregatePosts({ id: { in: postIds } }),
            aggregatePosts({
              id: { in: postIds },
              latestMetric: { performanceClass: "grew" },
            }),
            aggregatePosts({
              id: { in: postIds },
              latestMetric: { performanceClass: "underperformed" },
            }),
          ])
        : [null, null, null];

    return NextResponse.json({
      collection,
      aggregates,
      grewAggregates,
      underperformedAggregates,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("member");
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const collection = await prisma.collection.update({
      where: { id },
      data: body,
    });
    return NextResponse.json({ collection });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("member");
    const { id } = await params;
    await prisma.collection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
