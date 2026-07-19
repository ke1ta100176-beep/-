/**
 * 本番用ユーザー作成CLI（モックデータを入れずに運用を始める場合に使う）。
 * 使い方:
 *   npx tsx scripts/createUser.ts <email> <password> <名前> [admin|member|viewer]
 * 例:
 *   npx tsx scripts/createUser.ts you@example.com mypassword123 自分 admin
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [email, password, name, roleArg] = process.argv.slice(2);
  if (!email || !password || !name) {
    console.error(
      "使い方: tsx scripts/createUser.ts <email> <password> <名前> [admin|member|viewer]"
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("パスワードは8文字以上にしてください");
    process.exit(1);
  }
  const role: Role = (["admin", "member", "viewer"] as const).includes(
    roleArg as Role
  )
    ? (roleArg as Role)
    : "member";

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, name, role, isActive: true },
    create: { email: email.toLowerCase(), passwordHash, name, role },
  });
  console.log(`✅ ユーザー作成/更新: ${user.email}（${user.role}）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
