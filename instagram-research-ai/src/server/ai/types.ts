import type { ZodType } from "zod";

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredGenerationArgs<T> {
  schema: ZodType<T>;
  /** ツール定義に使うJSON Schema（Zodから変換済みのもの） */
  jsonSchema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
  model?: string;
  maxRetries?: number;
}

export interface StructuredGenerationResult<T> {
  data: T;
  raw: unknown;
  modelName: string;
  usage: AIUsage;
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatTurnResult {
  /** モデルがツールを呼んだ場合 */
  toolCall?: { name: string; input: unknown; toolUseId: string };
  /** 最終テキスト回答 */
  text?: string;
  modelName: string;
  usage: AIUsage;
}

export interface AIProvider {
  readonly name: string;
  generateStructured<T>(
    args: StructuredGenerationArgs<T>
  ): Promise<StructuredGenerationResult<T>>;
  /** ツール呼び出し付きチャット1ターン */
  chatTurn(args: {
    systemPrompt: string;
    messages: AIChatMessage[];
    tools: ChatToolDefinition[];
    model?: string;
  }): Promise<ChatTurnResult>;
}

export type AIChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | {
      role: "assistant";
      toolCall: { name: string; input: unknown; toolUseId: string };
    }
  | { role: "tool_result"; toolUseId: string; content: string };

export class AIValidationError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: unknown
  ) {
    super(message);
    this.name = "AIValidationError";
  }
}

/** モデル別コスト概算（USD / 1Mトークン）。JobRunのコスト記録に使用。 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export function estimateCostUsd(model: string, usage: AIUsage): number {
  const cost = MODEL_COSTS[model];
  if (!cost) return 0;
  return (
    (usage.inputTokens / 1_000_000) * cost.input +
    (usage.outputTokens / 1_000_000) * cost.output
  );
}
