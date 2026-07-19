import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createAccountSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._]+$/, "Instagramユーザー名の形式ではありません"),
  displayName: z.string().max(120).optional(),
  followersCount: z.coerce.number().int().min(0).default(0),
  categoryId: z.string().nullish(),
  benchmarkGroupId: z.string().nullish(),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole("viewer");
    const { searchParams } = request.nextUrl;
    const query = searchParams.get("q") ?? undefined;
    const includeInactive = searchParams.get("includeInactive") === "true";

    const accounts = await prisma.account.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(query
          ? {
              OR: [
                { username: { contains: query, mode: "insensitive" } },
                { displayName: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        benchmarkGroup: true,
        _count: { select: { posts: true } },
      },
      orderBy: { followersCount: "desc" },
      take: 500,
    });
    return NextResponse.json({ accounts });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("member");
    const body = createAccountSchema.parse(await request.json());

    const account = await prisma.account.create({
      data: {
        username: body.username,
        displayName: body.displayName ?? body.username,
        profileUrl: `https://www.instagram.com/${body.username}/`,
        followersCount: body.followersCount,
        categoryId: body.categoryId ?? null,
        benchmarkGroupId: body.benchmarkGroupId ?? null,
        isActive: body.isActive,
        sourceType: "manual",
      },
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
