import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 1,
  workers: 1, // 認証状態・DBを共有するため直列実行
  use: {
    baseURL: "http://localhost:3210",
    screenshot: "only-on-failure",
    // 実行環境にプリインストールされたChromiumを使う（バージョン違いの再DL回避）。
    // ローカルで通常のPlaywright管理ブラウザを使う場合はこの行を削除してよい。
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command: "npm run start -- -p 3210",
    url: "http://localhost:3210/login",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      AI_PROVIDER: "stub",
      DATA_SOURCE: "mock",
    },
  },
});
