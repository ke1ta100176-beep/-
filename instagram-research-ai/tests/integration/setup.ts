/**
 * 統合テストのセットアップ。開発DBを汚さないよう専用DBへ切り替える。
 * 事前に: createdb instagram_research_test && DATABASE_URL=... prisma db push
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@localhost:5432/instagram_research_test";
process.env.AI_PROVIDER = "stub";
process.env.DATA_SOURCE = "mock";
