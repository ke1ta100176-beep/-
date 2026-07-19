import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  kind: z.enum(["category", "benchmarkGroup"]),
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠ー]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `item-${Date.now()}`;
}

/** カテゴリ・ベンチマークグループのマスタ（追加・編集可能な分類） */
export async function GET() {
  try {
    await requireRole("viewer");
    const [categories, benchmarkGroups, genreProfiles] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.benchmarkGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.genreProfile.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ categories, benchmarkGroups, genreProfiles });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("member");
    const body = createSchema.parse(await request.json());
    const data = {
      name: body.name,
      slug: slugify(body.name),
      description: body.description,
    };
    const item =
      body.kind === "category"
        ? await prisma.category.create({ data })
        : await prisma.benchmarkGroup.create({ data });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
