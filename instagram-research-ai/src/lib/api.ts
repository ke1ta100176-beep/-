import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth";

/** APIルート共通のエラーハンドリング。機密情報をレスポンスへ漏らさない。 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "入力値が不正です",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }
  console.error("[api] unhandled error:", error);
  return NextResponse.json(
    { error: "サーバーエラーが発生しました" },
    { status: 500 }
  );
}
