import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { aggregatePosts } from "@/server/db/repositories/postsRepo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDuration,
  formatNumber,
  PERFORMANCE_CLASS_COLORS,
  PERFORMANCE_CLASS_LABELS,
} from "@/lib/utils";
import { RemoveFromCollectionButton } from "@/components/collections/RemoveFromCollectionButton";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: {
      posts: {
        include: {
          post: {
            include: {
              account: true,
              latestMetric: true,
              analyses: { where: { isLatest: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!collection) notFound();

  const postIds = collection.posts.map((cp) => cp.postId);
  const [aggregates, grewAgg, underAgg] =
    postIds.length > 0
      ? await Promise.all([
          aggregatePosts({ id: { in: postIds } }),
          aggregatePosts({
            id: { in: postIds },
            latestMetric: { performanceClass: "grew" },
          }),
          aggregatePosts({
            id: { in: postIds },
            latestMetric: { performanceClass: "underperformed" },
          }),
        ])
      : [null, null, null];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/collections" className="hover:underline">
            コレクション
          </Link>
          {" / "}
          {collection.name}
        </p>
        <h1 className="mt-1 text-xl font-bold">{collection.name}</h1>
        {collection.description && (
          <p className="mt-1 text-sm text-slate-500">{collection.description}</p>
        )}
      </div>

      {aggregates && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="投稿数" value={`${aggregates.totalCount}件`} />
          <StatCard
            label="平均再生数"
            value={formatNumber(aggregates.avgViews)}
          />
          <StatCard
            label="再生中央値"
            value={formatNumber(aggregates.medianViews)}
          />
          <StatCard
            label="平均動画尺"
            value={
              aggregates.avgDurationSeconds != null
                ? `${aggregates.avgDurationSeconds}秒`
                : "—"
            }
          />
        </div>
      )}

      {aggregates && (
        <div className="grid gap-6 md:grid-cols-3">
          <TagCard title="主なテーマ" items={aggregates.topThemes} />
          <TagCard title="主なフック" items={aggregates.topHooks} />
          <TagCard title="主なCTA" items={aggregates.topCtas} />
        </div>
      )}

      {(grewAgg || underAgg) && (
        <div className="grid gap-6 md:grid-cols-2">
          <ComparisonCard
            title="伸びた投稿群の共通点"
            agg={grewAgg}
            tone="grew"
          />
          <ComparisonCard
            title="伸び悩んだ投稿群の共通点"
            agg={underAgg}
            tone="under"
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>投稿一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {collection.posts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              投稿がまだありません。投稿詳細画面からこのコレクションへ追加できます。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {collection.posts.map(({ post }) => (
                <li key={post.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/posts/${post.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {post.caption?.slice(0, 60) || "（キャプションなし）"}
                    </Link>
                    <p className="text-xs text-slate-500">
                      @{post.account.username}・
                      {formatNumber(post.latestMetric?.views)}再生・
                      {formatDuration(post.durationSeconds)}
                    </p>
                  </div>
                  {post.latestMetric?.performanceClass && (
                    <Badge
                      className={
                        PERFORMANCE_CLASS_COLORS[post.latestMetric.performanceClass]
                      }
                    >
                      {PERFORMANCE_CLASS_LABELS[post.latestMetric.performanceClass]}
                    </Badge>
                  )}
                  <RemoveFromCollectionButton
                    collectionId={collection.id}
                    postId={post.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function TagCard({
  title,
  items,
}: {
  title: string;
  items: { value: string; count: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">データ不足（AI分析後に表示）</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((t) => (
              <Badge
                key={t.value}
                className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {t.value}（{t.count}）
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComparisonCard({
  title,
  agg,
  tone,
}: {
  title: string;
  agg: Awaited<ReturnType<typeof aggregatePosts>> | null;
  tone: "grew" | "under";
}) {
  const toneClass =
    tone === "grew"
      ? "border-emerald-200 dark:border-emerald-900"
      : "border-orange-200 dark:border-orange-900";
  return (
    <Card className={toneClass}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-slate-400">
          相関に基づく共通点であり、因果関係を示すものではありません
        </p>
      </CardHeader>
      <CardContent>
        {!agg || agg.totalCount < 2 ? (
          <p className="text-sm text-slate-500">
            該当投稿が{agg?.totalCount ?? 0}件のためデータ不足です（2件以上で表示）。
          </p>
        ) : (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">対象投稿数</dt>
              <dd>{agg.totalCount}件</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">平均動画尺</dt>
              <dd>
                {agg.avgDurationSeconds != null
                  ? `${agg.avgDurationSeconds}秒`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">多いフック</dt>
              <dd>
                {agg.topHooks.map((h) => `${h.value}（${h.count}）`).join("、") ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">多いCTA</dt>
              <dd>
                {agg.topCtas.map((c) => `${c.value}（${c.count}）`).join("、") ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">多いテーマ</dt>
              <dd>
                {agg.topThemes
                  .map((t) => `${t.value}（${t.count}）`)
                  .join("、") || "—"}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
