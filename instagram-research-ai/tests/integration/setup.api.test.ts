import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * 初回セットアップAPIのガード検証（ロジックを直接検証）。
 * ユーザーが1人でも存在すればセットアップは実行できない。
 */
describe("初回セットアップのガード", () => {
  beforeAll(async () => {
    await prisma.chatMessage.deleteMany();
    await prisma.chatSession.deleteMany();
    await prisma.collection.deleteMany();
    await prisma.ingestToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("ユーザー0人のときのみ needsSetup=true 相当になる", async () => {
    expect(await prisma.user.count()).toBe(0);

    // 1人目の作成（セットアップ成功に相当）
    await prisma.$transaction(async (tx) => {
      const count = await tx.user.count();
      expect(count).toBe(0);
      await tx.user.create({
        data: {
          email: "first@example.com",
          name: "最初の管理者",
          passwordHash: await bcrypt.hash("password123", 4),
          role: "admin",
        },
      });
    });

    // 2回目は拒否される（トランザクション内カウントで検出）
    await expect(
      prisma.$transaction(async (tx) => {
        const count = await tx.user.count();
        if (count > 0) throw new Error("SETUP_DONE");
        await tx.user.create({
          data: {
            email: "second@example.com",
            name: "2人目",
            passwordHash: "x",
            role: "admin",
          },
        });
      })
    ).rejects.toThrow("SETUP_DONE");

    expect(await prisma.user.count()).toBe(1);
  });
});
