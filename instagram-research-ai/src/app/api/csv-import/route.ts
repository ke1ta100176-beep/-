import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { parseCsvImport } from "@/server/providers/instagram/csv";
import { importNormalizedPosts } from "@/server/services/ingest";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

/**
 * CSVインポート。同一投稿の再インポートでも数値履歴は上書きされず追記される。
 * 形式: username,instagram_url,posted_at,caption,hashtags,audio_name,
 *       duration_seconds,followers_count,views,likes,comments,saves,shares,measured_at
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole("member");

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSVファイルを file フィールドで送信してください" },
        { status: 400 }
      );
    }
    if (file.size > MAX_CSV_BYTES) {
      return NextResponse.json(
        { error: "CSVファイルが大きすぎます（上限5MB）" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const { posts, errors } = parseCsvImport(text);

    if (posts.length === 0) {
      return NextResponse.json(
        { error: "取り込める行がありません", rowErrors: errors },
        { status: 400 }
      );
    }

    const result = await importNormalizedPosts(posts, "csv");
    return NextResponse.json({ ...result, rowErrors: errors });
  } catch (error) {
    return handleApiError(error);
  }
}
