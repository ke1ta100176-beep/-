import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { postFilterSchema } from "@/lib/schemas/postFilters";
import { queryPosts } from "@/server/db/repositories/postsRepo";
import { ingestPostUrl } from "@/server/services/ingest";

/** 投稿一覧検索。フィルタはクエリパラメータのJSONまたは個別パラメータで受ける。 */
export async function GET(request: NextRequest) {
  try {
    await requireRole("viewer");
    const { searchParams } = request.nextUrl;
    const filterJson = searchParams.get("filter");
    let raw: unknown;
    if (filterJson) {
      try {
        raw = JSON.parse(filterJson);
      } catch {
        return NextResponse.json(
          { error: "filter パラメータが不正なJSONです" },
          { status: 400 }
        );
      }
    } else {
      raw = Object.fromEntries(searchParams.entries());
    }
    const filter = postFilterSchema.parse(raw);
    const result = await queryPosts(filter);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

const createPostSchema = z.object({
  url: z.string().url().max(500),
  username: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9._]*$/)
    .optional(),
});

/** 手動URL登録 */
export async function POST(request: NextRequest) {
  try {
    await requireRole("member");
    const body = createPostSchema.parse(await request.json());
    const result = await ingestPostUrl(body.url, {
      sourceType: "manual",
      username: body.username || undefined,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Instagram投稿URL")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
