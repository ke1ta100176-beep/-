import Anthropic from "@anthropic-ai/sdk";
import {
  AIValidationError,
  type AIChatMessage,
  type AIProvider,
  type ChatTurnResult,
  type StructuredGenerationArgs,
  type StructuredGenerationResult,
} from "../types";

const DEFAULT_MODEL = "claude-sonnet-5";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。設定画面の手順に従い環境変数で設定してください。"
    );
  }
  return new Anthropic({ apiKey });
}

function toAnthropicMessages(
  messages: AIChatMessage[]
): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    if (m.role === "user") return { role: "user", content: m.content };
    if (m.role === "tool_result") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolUseId,
            content: m.content,
          },
        ],
      };
    }
    if ("toolCall" in m) {
      return {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: m.toolCall.toolUseId,
            name: m.toolCall.name,
            input: m.toolCall.input as Record<string, unknown>,
          },
        ],
      };
    }
    return { role: "assistant", content: m.content };
  });
}

/**
 * Anthropic実装。構造化出力はtool-use強制で取得し、Zod検証失敗時は
 * エラー内容をフィードバックして再試行する。
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  async generateStructured<T>(
    args: StructuredGenerationArgs<T>
  ): Promise<StructuredGenerationResult<T>> {
    const client = getClient();
    const model = args.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
    const maxRetries = args.maxRetries ?? 2;
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: args.userPrompt },
    ];
    let lastRaw: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: args.systemPrompt,
        messages,
        tools: [
          {
            name: "record_analysis",
            description:
              "分析結果を構造化して記録する。必ずこのツールを1回だけ呼ぶこと。",
            input_schema: args.jsonSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "record_analysis" },
      });

      totalUsage.inputTokens += response.usage.input_tokens;
      totalUsage.outputTokens += response.usage.output_tokens;

      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      lastRaw = toolUse?.input ?? null;

      const parsed = args.schema.safeParse(lastRaw);
      if (parsed.success) {
        return {
          data: parsed.data,
          raw: lastRaw,
          modelName: model,
          usage: totalUsage,
        };
      }

      // 検証エラーをフィードバックして再試行
      messages.push(
        {
          role: "assistant",
          content: toolUse
            ? [
                {
                  type: "tool_use",
                  id: toolUse.id,
                  name: toolUse.name,
                  input: toolUse.input as Record<string, unknown>,
                },
              ]
            : "（ツール未呼び出し）",
        },
        {
          role: "user",
          content: toolUse
            ? [
                {
                  type: "tool_result" as const,
                  tool_use_id: toolUse.id,
                  content: `出力がスキーマ検証に失敗しました: ${parsed.error.message}。修正して record_analysis を再度呼んでください。`,
                  is_error: true,
                },
              ]
            : "record_analysis ツールを必ず呼んでください。",
        }
      );
    }

    throw new AIValidationError(
      `AI出力が${maxRetries + 1}回の試行すべてでスキーマ検証に失敗しました`,
      lastRaw
    );
  }

  async chatTurn(args: {
    systemPrompt: string;
    messages: AIChatMessage[];
    tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
    model?: string;
  }): Promise<ChatTurnResult> {
    const client = getClient();
    const model = args.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: args.systemPrompt,
      messages: toAnthropicMessages(args.messages),
      tools: args.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (toolUse) {
      return {
        toolCall: {
          name: toolUse.name,
          input: toolUse.input,
          toolUseId: toolUse.id,
        },
        modelName: model,
        usage,
      };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { text, modelName: model, usage };
  }
}
