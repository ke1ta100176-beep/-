import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  PERFORMANCE_CLASS_COLORS,
  PERFORMANCE_CLASS_LABELS,
} from "@/lib/utils";
import { MetricsHistoryChart } from "@/components/charts/MetricsHistoryChart";
import { AnalyzeButton } from "@/components/posts/AnalyzeButton";
import { CollectionPicker } from "@/components/posts/CollectionPicker";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      account: { include: { category: true, benchmarkGroup: true } },
      latestMetric: true,
      metrics: { orderBy: { measuredAt: "asc" } },
      analyses: { orderBy: { analyzedAt: "desc" }, take: 3 },
      scores: { where: { isLatest: true } },
      collections: { include: { collection: true } },
    },
  });
  if (!post) notFound();

  const analysis = post.analyses.find((a) => a.isLatest) ?? post.analyses[0];
  const score = post.scores[0];

  // 類似投稿: 同テーマの伸びた/伸びなかった投稿
  const themes = analysis?.themes ?? [];
  const [similarGrew, similarUnder] =
    themes.length > 0
      ? await Promise.all([
          prisma.post.findMany({
            where: {
              id: { not: post.id },
              analyses: { some: { isLatest: true, themes: { hasSome: themes } } },
              latestMetric: { performanceClass: "grew" },
            },
            include: { account: true, latestMetric: true },
            take: 5,
          }),
          prisma.post.findMany({
            where: {
              id: { not: post.id },
              analyses: { some: { isLatest: true, themes: { hasSome: themes } } },
              latestMetric: { performanceClass: "underperformed" },
            },
            include: { account: true, latestMetric: true },
            take: 5,
          }),
        ])
      : [[], []];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">
            <Link href="/posts" className="hover:underline">
              投稿一覧
            </Link>
            {" / "}投稿詳細
          </p>
          <h1 className="mt-1 max-w-2xl text-lg font-bold">
            {post.caption?.slice(0, 80) || "（キャプションなし）"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            @{post.account.username}・フォロワー
            {formatNumber(post.account.followersCount)}・
            {formatDateTime(post.postedAt)}投稿・
            {formatDuration(post.durationSeconds)}
            {post.audioName && `・音源: ${post.audioName}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <a
            href={post.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Instagramで開く ↗
          </a>
          <CollectionPicker postId={post.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="再生数" value={formatNumber(post.latestMetric?.views)} />
        <Stat
          label="直近増加"
          value={
            post.latestMetric?.viewsDelta != null
              ? `+${formatNumber(post.latestMetric.viewsDelta)}`
              : "—"
          }
        />
        <Stat
          label="増加/時"
          value={
            post.latestMetric?.viewsPerHour != null
              ? formatNumber(Math.round(post.latestMetric.viewsPerHour))
              : "—"
          }
        />
        <Stat
          label="フォロワー倍率"
          value={
            post.latestMetric?.followerRatio != null
              ? `${post.latestMetric.followerRatio.toFixed(2)}x`
              : "—"
          }
        />
        <Stat
          label="トレンドスコア"
          value={post.latestMetric?.trendScore?.toFixed(1) ?? "—"}
          accent
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>数値推移</CardTitle>
            <p className="text-xs text-slate-500">
              最終取得: {formatDateTime(post.lastFetchedAt)}
            </p>
          </CardHeader>
          <CardContent>
            <MetricsHistoryChart
              points={post.metrics.map((m) => ({
                measuredAt: m.measuredAt.toISOString(),
                hoursSincePosted: m.hoursSincePosted,
                views: m.views,
                likes: m.likes,
                comments: m.comments,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>トレンドスコア内訳</CardTitle>
          </CardHeader>
          <CardContent>
            {score ? (
              <div className="space-y-2">
                <ScoreRow label="増加速度" value={score.velocityScore} />
                <ScoreRow label="増加率" value={score.growthScore} />
                <ScoreRow label="フォロワー倍率" value={score.followerRatioScore} />
                <ScoreRow label="鮮度" value={score.freshnessScore} />
                <ScoreRow
                  label="アカウント平均比"
                  value={score.accountBaselineScore}
                />
                <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800">
                  <p>
                    判定:{" "}
                    <Badge className={PERFORMANCE_CLASS_COLORS[score.performanceClass]}>
                      {PERFORMANCE_CLASS_LABELS[score.performanceClass]}
                    </Badge>
                  </p>
                  <p className="mt-1">
                    基準:{" "}
                    {score.baselineSource === "account"
                      ? "同一アカウント過去投稿の中央値"
                      : score.baselineSource === "category"
                        ? "同カテゴリ中央値（アカウント履歴不足）"
                        : "基準なし"}
                    ・計算バージョン v{score.calculationVersion}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                スコア未計算です。スコア計算ジョブ実行後に表示されます。
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>AI分析</CardTitle>
          <AnalyzeButton postId={post.id} hasAnalysis={Boolean(analysis)} />
        </CardHeader>
        <CardContent>
          {!analysis ? (
            <p className="text-sm text-slate-500">
              まだAI分析されていません。「AI分析を実行」を押してください。
            </p>
          ) : analysis.status === "failed" ? (
            <p className="text-sm text-red-600">
              前回のAI分析は失敗しました（{analysis.errorMessage}）。再実行してください。
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {analysis.mainGenre && (
                  <Badge className="bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    {analysis.mainGenre}
                  </Badge>
                )}
                {analysis.themes.map((t) => (
                  <Badge
                    key={t}
                    className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                  >
                    {t}
                  </Badge>
                ))}
                {analysis.hookType && (
                  <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    フック: {analysis.hookType}
                  </Badge>
                )}
                {analysis.ctaType && (
                  <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    CTA: {analysis.ctaType}
                  </Badge>
                )}
              </div>

              <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
                <AnalysisRow label="企画の要約" value={analysis.summary} />
                <AnalysisRow label="ペルソナ" value={analysis.persona} />
                <AnalysisRow
                  label="想定される悩み"
                  value={analysis.painPoints.join("、")}
                />
                <AnalysisRow
                  label="ベネフィット"
                  value={analysis.benefits.join("、")}
                />
                <AnalysisRow label="フック文言" value={analysis.hookText} />
                <AnalysisRow
                  label="感情"
                  value={analysis.emotions.join("、")}
                />
                <AnalysisRow label="訴求タイプ" value={analysis.appealType} />
                <AnalysisRow
                  label="属人性"
                  value={analysis.personalityLevel}
                />
                <AnalysisRow
                  label="動画構成（推定）"
                  value={analysis.videoStructure}
                />
                {analysis.attributes != null && (
                  <AnalysisRow
                    label="ジャンル固有属性"
                    value={Object.entries(
                      analysis.attributes as Record<string, string | string[]>
                    )
                      .map(
                        ([k, v]) =>
                          `${k}: ${Array.isArray(v) ? v.join("、") : v}`
                      )
                      .join(" / ")}
                  />
                )}
              </dl>

              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
                <p className="font-medium">
                  AIの分析理由（相関ベースの推定であり、因果関係を断定するものではありません）
                </p>
                <p className="mt-1">{analysis.reasoning}</p>
                <p className="mt-2 text-slate-400">
                  信頼度: {((analysis.confidenceScore ?? 0) * 100).toFixed(0)}%・
                  モデル: {analysis.modelName}・
                  {formatDateTime(analysis.analyzedAt)}分析
                  {analysis.status === "low_confidence" &&
                    "・⚠ 低信頼度のため参考程度にしてください"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <SimilarPostsCard
          title="同じテーマで伸びた投稿"
          posts={similarGrew}
          emptyText="同じテーマで「伸びた」判定の投稿はまだありません。"
        />
        <SimilarPostsCard
          title="同じテーマで伸び悩んだ投稿"
          posts={similarUnder}
          emptyText="同じテーマで「伸び悩み」判定の投稿はまだありません。"
        />
      </div>

      {post.caption && (
        <Card>
          <CardHeader>
            <CardTitle>キャプション全文</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{post.caption}</p>
            {post.hashtags.length > 0 && (
              <p className="mt-2 text-sm text-indigo-600 dark:text-indigo-400">
                {post.hashtags.join(" ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p
          className={`mt-1 text-xl font-bold ${accent ? "text-indigo-600 dark:text-indigo-400" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-mono">{(value * 100).toFixed(0)}</span>
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-indigo-500"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

function AnalysisRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function SimilarPostsCard({
  title,
  posts,
  emptyText,
}: {
  title: string;
  posts: {
    id: string;
    caption: string | null;
    account: { username: string };
    latestMetric: { views: number | null } | null;
  }[];
  emptyText: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/posts/${p.id}`}
                  className="block truncate text-sm hover:underline"
                >
                  {p.caption?.slice(0, 50) || "（キャプションなし）"}
                </Link>
                <p className="text-xs text-slate-500">
                  @{p.account.username}・{formatNumber(p.latestMetric?.views)}再生
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
