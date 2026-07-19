import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * ログイン失敗の原因切り分け用。
 * 「DB接続エラー」と「認証情報の不一致」を区別して返す
 * （どのフィールドが違うかまでは返さない）。
 */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ reason: "invalid" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ reason: "invalid" });
    }
    const match = await bcrypt.compare(body.password, user.passwordHash);
    return NextResponse.json({ reason: match ? "ok" : "invalid" });
  } catch (error) {
    console.error("[login-diagnose] db error:", error);
    return NextResponse.json({ reason: "db_error" });
  }
}
