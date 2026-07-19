import { PrismaClient } from "@prisma/client";

/**
 * Supabase Transaction pooler(6543)使用時は pgbouncer=true が必須
 * （プリペアドステートメント衝突による間欠的エラーを防ぐ）。
 * 設定ミスに依存しないよう、URLに不足していればここで自動付与する。
 */
function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.includes(":6543/") && !url.includes("pgbouncer=true")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}pgbouncer=true&connection_limit=1`;
  }
  return url;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: normalizeDatabaseUrl(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
