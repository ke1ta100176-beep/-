import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { aggregatePosts } from "@/server/db/repositories/postsRepo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  formatNumber,
  PERFORMANCE_CLASS_COLORS,
  PERFORMANCE_CLASS_LABELS,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 3600 * 1000);
  const twoWeeksAgo = new Date(todayStart.getTime() - 14 * 24 * 3600 * 1000);

  const [
    addedYesterday,
    addedToday,
    trendingPosts,
    fetchErrors,
    grewAggregates,
    smallRisers,
  ] = await Promise.all([
    prisma.post.count({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
    }),
    prisma.post.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.post.findMany({
      where: { latestMetric: { trendScore: { gte: 40 } } },
      include: {
        account: true,
        latestMetric: true,
        analyses: { where: { isLatest: true } },
      },
      orderBy: { latestMetric: { trendScore: "desc" } },
      take: 10,
    }),
    prisma.post.count({ where: { fetchStatus: "failed" } }),
    aggregatePosts({
      postedAt: { gte: twoWeeksAgo },
      latestMetric: { performanceClass: "grew" },
    }),
    prisma.post.findMany({
      where: {
        account: { followersCount: { lte: 30_000 } },
        latestMetric: { trendScore: { gte: 30 } },
      },
      include: { account: true, latestMetric: true },
      orderBy: { latestMetric: { trendScore: "desc" } },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">ダッシュボード</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="昨日追加された投稿" value={`${addedYesterday}件`} />
        <StatCard label="本日追加された投稿" value={`${addedToday}件`} />
        <StatCard label="急上昇投稿" value={`${trendingPosts.length}件`} />
        <StatCard
          label="データ取得エラー"
          value={`${fetchErrors}件`}
          warn={fetchErrors > 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>急上昇投稿（トレンドスコア順）</CardTitle>
          </CardHeader>
          <CardContent>
            {trendingPosts.length === 0 ? (
              <EmptyNote text="急上昇投稿はまだありません。スコア計算ジョブを実行するとここに表示されます。" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {trendingPosts.map((post) => (
                  <li key={post.id} className="flex items-center gap-3 py-2">
                    <span className="w-12 shrink-0 text-right font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {post.latestMetric?.trendScore?.toFixed(1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/posts/${post.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {post.caption?.slice(0, 60) || "（キャプションなし）"}
                      </Link>
                      <p className="text-xs text-slate-500">
                        @{post.account.username}・
                        {formatNumber(post.latestMetric?.views)}再生・+
                        {formatNumber(post.latestMetric?.viewsDelta)}（
                        {formatNumber(
                          Math.round(post.latestMetric?.viewsPerHour ?? 0)
                        )}
                        /時）
                      </p>
                    </div>
                    {post.latestMetric?.performanceClass && (
                      <Badge
                        className={
                          PERFORMANCE_CLASS_COLORS[
                            post.latestMetric.performanceClass
                          ]
                        }
                      >
                        {
                          PERFORMANCE_CLASS_LABELS[
                            post.latestMetric.performanceClass
                          ]
                        }
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>最近増えているテーマ（直近14日・伸びた投稿）</CardTitle>
            </CardHeader>
            <CardContent>
              {grewAggregates.topThemes.length === 0 ? (
                <EmptyNote text="データ不足です。AI分析済みの伸びた投稿が増えると表示されます。" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {grewAggregates.topThemes.map((t) => (
                    <Badge
                      key={t.value}
                      className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                    >
                      {t.value}（{t.count}）
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>最近増えているフック</CardTitle>
            </CardHeader>
            <CardContent>
              {grewAggregates.topHooks.length === 0 ? (
                <EmptyNote text="データ不足です。" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {grewAggregates.topHooks.map((t) => (
                    <Badge
                      key={t.value}
                      className="bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    >
                      {t.value}（{t.count}）
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>注目: 小規模アカウントの急上昇</CardTitle>
              <p className="text-xs text-slate-500">フォロワー3万人以下</p>
            </CardHeader>
            <CardContent>
              {smallRisers.length === 0 ? (
                <EmptyNote text="該当する投稿はまだありません。" />
              ) : (
                <ul className="space-y-2">
                  {smallRisers.map((post) => (
                    <li key={post.id}>
                      <Link
                        href={`/posts/${post.id}`}
                        className="block truncate text-sm hover:underline"
                      >
                        @{post.account.username}
                      </Link>
                      <p className="text-xs text-slate-500">
                        フォロワー{formatNumber(post.account.followersCount)}・
                        {formatNumber(post.latestMetric?.views)}再生（
                        {post.latestMetric?.followerRatio?.toFixed(1)}倍）
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        最終更新: {formatDateTime(now)}／トレンドスコア・分類はAIとルールによる推定値であり、実際の成果を保証するものではありません。
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p
          className={`mt-1 text-2xl font-bold ${warn ? "text-red-600" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-slate-500">{text}</p>;
}
