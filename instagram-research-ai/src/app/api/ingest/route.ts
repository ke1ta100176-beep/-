import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ingestPostUrl } from "@/server/services/ingest";
import { analyzePost } from "@/server/ai/analyzePost";

/**
 * シェア受け口。iOSショートカット / Android PWA共有 / 外部スクリプトから
 * Instagram投稿URLをPOSTすると自動で登録・AIタグ付けキューへ入る。
 * 認証: IngestToken（個人用トークン、ハッシュ保存）。セッション認証は不要。
 */

const ingestSchema = z.object({
  url: z.string().max(500),
  username: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9._]*$/)
    .optional(),
});

// 簡易レートリミッタ（トークン単位・インスタンスローカル）。
// サーバーレス環境では完全ではないが、乱用の一次防御として機能する。
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  // トークンは Authorization: Bearer またはクエリパラメータで受ける
  // （iOSショートカットはヘッダー設定も可能だがクエリの方が設定が簡単）
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const queryToken = request.nextUrl.searchParams.get("token");
  const token = bearerToken ?? queryToken;

  if (!token || token.length < 16) {
    return NextResponse.json({ error: "トークンが必要です" }, { status: 401 });
  }

  const tokenRow = await prisma.ingestToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { isActive: true } } },
  });
  if (!tokenRow || tokenRow.revokedAt || !tokenRow.user.isActive) {
    return NextResponse.json({ error: "トークンが無効です" }, { status: 401 });
  }

  if (!checkRateLimit(tokenRow.id)) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらく待ってから再試行してください" },
      { status: 429 }
    );
  }

  try {
    // iOSショートカットはtext/plainでURLだけ送るケースもあるため両対応
    const contentType = request.headers.get("content-type") ?? "";
    let body: z.infer<typeof ingestSchema>;
    if (contentType.includes("application/json")) {
      body = ingestSchema.parse(await request.json());
    } else {
      const text = (await request.text()).trim();
      body = ingestSchema.parse({ url: text });
    }

    const result = await ingestPostUrl(body.url, {
      sourceType: "share",
      username: body.username || undefined,
    });

    await prisma.ingestToken.update({
      where: { id: tokenRow.id },
      data: { lastUsedAt: new Date() },
    });

    // 新規投稿は自動でAIタグ付け（失敗しても登録自体は成功として返す）
    if (result.created) {
      analyzePost(result.postId).catch((error) => {
        console.error("[ingest] auto-analyze failed:", error);
      });
    }

    return NextResponse.json(
      {
        ok: true,
        postId: result.postId,
        created: result.created,
        message: result.created
          ? "投稿を登録しました。AI分析を開始します。"
          : "既存の投稿です。数値を再取得しました。",
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError || (error instanceof Error && error.message.includes("Instagram投稿URL"))) {
      return NextResponse.json(
        { error: "Instagram投稿URLとして解釈できませんでした" },
        { status: 400 }
      );
    }
    console.error("[ingest] error:", error);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }
}
