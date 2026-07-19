import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // 統合テストは同一DBを共有するため直列実行する
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
