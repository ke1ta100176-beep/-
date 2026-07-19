import { AnthropicProvider } from "./anthropic";
import { StubAIProvider } from "./stub";
import type { AIProvider } from "./types";

/**
 * アクティブなAIプロバイダーを返す。
 * AI_PROVIDER 環境変数で切り替え（anthropic / stub）。
 * APIキー未設定時は自動でスタブへフォールバックし、開発・CIを止めない。
 */
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "anthropic";
  if (provider === "stub") return new StubAIProvider();
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) return new StubAIProvider();
    return new AnthropicProvider();
  }
  throw new Error(
    `未知の AI_PROVIDER: ${provider}。README の「AIモデルの変更方法」を参照してください。`
  );
}
