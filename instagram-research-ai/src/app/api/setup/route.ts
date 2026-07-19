import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const setupSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上にしてください").max(200),
  name: z.string().min(1, "名前を入力してください").max(60),
});

/**
 * 初回セットアップ: ユーザーが1人も存在しない場合のみ、管理者アカウントを作成できる。
 * 1人でも存在すれば全リクエストを拒否する（本番での再実行を防止）。
 */
export async function POST(request: NextRequest) {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "セットアップは完了済みです。ログイン画面からログインしてください。" },
        { status: 403 }
      );
    }

    const body = setupSchema.parse(await request.json());
    const passwordHash = await bcrypt.hash(body.password, 10);

    // 同時リクエスト対策: トランザクション内で再度0件を確認してから作成
    const user = await prisma.$transaction(async (tx) => {
      const count = await tx.user.count();
      if (count > 0) throw new Error("SETUP_DONE");
      return tx.user.create({
        data: {
          email: body.email.toLowerCase(),
          name: body.name,
          passwordHash,
          role: "admin",
        },
      });
    });

    return NextResponse.json(
      { ok: true, email: user.email },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "入力値が不正です" },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "SETUP_DONE") {
      return NextResponse.json(
        { error: "セットアップは完了済みです。" },
        { status: 403 }
      );
    }
    console.error("[setup] error:", error);
    return NextResponse.json(
      { error: "セットアップに失敗しました" },
      { status: 500 }
    );
  }
}

// あらゆるキャッシュ層を確実に無効化する（CDN/ブラウザ）
export const dynamic = "force-dynamic";

/** セットアップが必要かどうか（画面の出し分け用）。診断用にDBホスト名も返す。 */
export async function GET() {
  const userCount = await prisma.user.count();
  const hostMatch = (process.env.DATABASE_URL ?? "").match(/@([^:/?]+)/);
  return NextResponse.json(
    {
      needsSetup: userCount === 0,
      userCount,
      dbHost: hostMatch?.[1] ?? "unknown",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
