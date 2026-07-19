import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateAccountSchema = z.object({
  displayName: z.string().max(120).optional(),
  followersCount: z.coerce.number().int().min(0).optional(),
  categoryId: z.string().nullish(),
  benchmarkGroupId: z.string().nullish(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("member");
    const { id } = await params;
    const body = updateAccountSchema.parse(await request.json());

    const account = await prisma.account.update({
      where: { id },
      data: {
        ...(body.displayName !== undefined && { displayName: body.displayName }),
        ...(body.followersCount !== undefined && {
          followersCount: body.followersCount,
        }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        ...(body.benchmarkGroupId !== undefined && {
          benchmarkGroupId: body.benchmarkGroupId,
        }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: { category: true, benchmarkGroup: true },
    });
    return NextResponse.json({ account });
  } catch (error) {
    return handleApiError(error);
  }
}
