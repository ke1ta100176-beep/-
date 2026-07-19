import { MockInstagramProvider } from "./mock";
import type { InstagramProvider } from "./types";

/**
 * アクティブなデータ取得Providerを返す。
 * DATA_SOURCE 環境変数で切り替え。将来 scraping_api 実装を追加する場合は
 * ここに分岐を1つ足すだけでよい（ビジネスロジック側の変更は不要）。
 */
let mockInstance: MockInstagramProvider | null = null;

export function getInstagramProvider(): InstagramProvider {
  const source = process.env.DATA_SOURCE ?? "mock";
  switch (source) {
    case "mock":
      if (!mockInstance) mockInstance = new MockInstagramProvider();
      return mockInstance;
    case "scraping_api":
      throw new Error(
        "scraping_api プロバイダーは未実装です。README の「データ取得Providerの追加方法」を参照してください。"
      );
    default:
      throw new Error(`未知の DATA_SOURCE: ${source}`);
  }
}
