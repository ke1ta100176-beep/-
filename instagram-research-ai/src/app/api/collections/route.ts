import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function GET() {
  try {
    await requireRole("viewer");
    const collections = await prisma.collection.findMany({
      include: { _count: { select: { posts: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ collections });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("member");
    const body = createSchema.parse(await request.json());
    const collection = await prisma.collection.create({
      data: {
        name: body.name,
        description: body.description,
        createdById: user.id,
      },
    });
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
