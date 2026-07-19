import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ postId: z.string().min(1) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole("member");
    const { id } = await params;
    const { postId } = bodySchema.parse(await request.json());

    // 既に追加済みなら成功として扱う（冪等）
    await prisma.collectionPost.upsert({
      where: { collectionId_postId: { collectionId: id, postId } },
      update: {},
      create: { collectionId: id, postId, addedBy: user.id },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("member");
    const { id } = await params;
    const { postId } = bodySchema.parse(await request.json());
    await prisma.collectionPost.deleteMany({
      where: { collectionId: id, postId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
