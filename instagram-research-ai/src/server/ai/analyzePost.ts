import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from ".";
import { checkCausalLanguage } from "./guardrails";
import {
  buildPostTaggingSystemPrompt,
  buildPostTaggingUserPrompt,
  POST_TAGGING_PROMPT_VERSION,
} from "./prompts/postTagging.v1";
import { postAnalysisSchema } from "./schemas";
import { AIValidationError, estimateCostUsd, type AIUsage } from "./types";

const LOW_CONFIDENCE_THRESHOLD = 0.4;

export interface AnalyzePostResult {
  analysisId: string;
  status: "ok" | "failed" | "low_confidence";
  usage: AIUsage;
  costUsd: number;
}

/**
 * 投稿1件をAIタグ付けする。
 * 再分析は既存行を変更せず新規行を挿入し isLatest をフリップする（履歴保持）。
 */
export async function analyzePost(
  postId: string,
  opts: { transcript?: string; model?: string } = {}
): Promise<AnalyzePostResult> {
  const post = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { account: true },
  });

  const genreProfiles = await prisma.genreProfile.findMany({
    where: { isActive: true },
  });
  const genreGuidance = genreProfiles
    .map((g) => {
      const attrs = (
        g.attributeSchema as { key: string; label: string; description?: string }[]
      )
        .map((a) => `  - attributes.${a.key}: ${a.label}${a.description ? `（${a.description}）` : ""}`)
        .join("\n");
      return `ジャンル「${g.name}」の場合:\n${g.promptGuidance ?? ""}\n${attrs}`;
    })
    .join("\n\n");

  const ai = getAIProvider();
  const systemPrompt = buildPostTaggingSystemPrompt(genreGuidance);
  const userPrompt = buildPostTaggingUserPrompt({
    caption: post.caption,
    hashtags: post.hashtags,
    audioName: post.audioName,
    durationSeconds: post.durationSeconds,
    username: post.account.username,
    followersCount: post.account.followersCount,
    transcript: opts.transcript,
  });

  const usage: AIUsage = { inputTokens: 0, outputTokens: 0 };
  try {
    const result = await ai.generateStructured({
      schema: postAnalysisSchema,
      jsonSchema: z.toJSONSchema(postAnalysisSchema) as Record<string, unknown>,
      systemPrompt,
      userPrompt,
      promptVersion: POST_TAGGING_PROMPT_VERSION,
      model: opts.model,
    });
    usage.inputTokens = result.usage.inputTokens;
    usage.outputTokens = result.usage.outputTokens;

    // 因果断定表現のガードレール検証（要約・分析理由が対象）
    const guardrail = checkCausalLanguage(
      `${result.data.summary} ${result.data.reasoning}`
    );

    const confidence = result.data.confidence;
    const status: "ok" | "low_confidence" =
      !guardrail.ok || confidence < LOW_CONFIDENCE_THRESHOLD
        ? "low_confidence"
        : "ok";

    const analysis = await prisma.$transaction(async (tx) => {
      await tx.aiAnalysis.updateMany({
        where: { postId, isLatest: true },
        data: { isLatest: false },
      });
      return tx.aiAnalysis.create({
        data: {
          postId,
          mainGenre: result.data.main_genre,
          subGenres: result.data.sub_genres,
          themes: result.data.themes,
          persona: result.data.persona,
          painPoints: result.data.pain_points,
          benefits: result.data.benefits,
          hookType: result.data.hook_type,
          hookText: result.data.hook_text,
          ctaType: result.data.cta_type,
          emotions: result.data.emotions,
          appealType: result.data.appeal_type,
          personalityLevel: result.data.personality_level,
          videoStructure: result.data.video_structure,
          summary: result.data.summary,
          reasoning: result.data.reasoning,
          attributes: result.data.attributes,
          confidenceScore: confidence,
          analysisJson: result.raw as object,
          modelName: result.modelName,
          promptVersion: POST_TAGGING_PROMPT_VERSION,
          status,
          errorMessage: guardrail.ok
            ? null
            : `因果断定表現を検出: ${guardrail.violations.join(", ")}`,
          isLatest: true,
        },
      });
    });

    return {
      analysisId: analysis.id,
      status,
      usage,
      costUsd: estimateCostUsd(result.modelName, usage),
    };
  } catch (error) {
    const message =
      error instanceof AIValidationError
        ? `スキーマ検証失敗: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);

    const analysis = await prisma.$transaction(async (tx) => {
      await tx.aiAnalysis.updateMany({
        where: { postId, isLatest: true },
        data: { isLatest: false },
      });
      return tx.aiAnalysis.create({
        data: {
          postId,
          status: "failed",
          errorMessage: message.slice(0, 1000),
          promptVersion: POST_TAGGING_PROMPT_VERSION,
          isLatest: true,
        },
      });
    });

    return { analysisId: analysis.id, status: "failed", usage, costUsd: 0 };
  }
}
