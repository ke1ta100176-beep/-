import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { postFilterSchema } from "@/lib/schemas/postFilters";
import { queryPosts } from "@/server/db/repositories/postsRepo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  PERFORMANCE_CLASS_COLORS,
  PERFORMANCE_CLASS_LABELS,
} from "@/lib/utils";
import { PostFilterBar } from "@/components/posts/PostFilterBar";
import { AddPostForm } from "@/components/posts/AddPostForm";

export const dynamic = "force-dynamic";

interface SearchParams {
  [key: string]: string | string[] | undefined;
}

function toFilterInput(params: SearchParams): Record<string, unknown> {
  const single = (k: string) =>
    typeof params[k] === "string" && params[k] !== "" ? params[k] : undefined;
  const list = (k: string) => {
    const v = single(k);
    return v ? (v as string).split(",").filter(Boolean) : undefined;
  };
  return {
    sortBy: single("sortBy"),
    sortOrder: single("sortOrder"),
    page: single("page"),
    freeText: single("q"),
    categorySlugs: list("category"),
    benchmarkGroupSlugs: list("group"),
    hookTypes: list("hook"),
    ctaTypes: list("cta"),
    themes: list("theme"),
    performanceClass: single("class"),
    analyzed:
      single("analyzed") === "true"
        ? true
        : single("analyzed") === "false"
          ? false
          : undefined,
    postedAfter: single("postedAfter"),
    postedBefore: single("postedBefore"),
    minFollowers: single("minFollowers"),
    maxFollowers: single("maxFollowers"),
    minViews: single("minViews"),
    maxDurationSeconds: single("maxDuration"),
    minTrendScore: single("minTrendScore"),
  };
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const parsed = postFilterSchema.safeParse(toFilterInput(params));
  const filter = parsed.success
    ? parsed.data
    : postFilterSchema.parse({});

  const [result, categories, groups] = await Promise.all([
    queryPosts(filter),
    prisma.category.findMany({ where: { isActive: true } }),
    prisma.benchmarkGroup.findMany({ where: { isActive: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.totalCount / filter.pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          投稿一覧
          <span className="ml-2 text-sm font-normal text-slate-500">
            {result.totalCount}件
          </span>
        </h1>
        <AddPostForm />
      </div>

      {!parsed.success && (
        <p className="text-sm text-red-600">
          フィルタ条件の一部が不正なため、デフォルト条件で表示しています。
        </p>
      )}

      <PostFilterBar
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        groups={groups.map((g) => ({ slug: g.slug, name: g.name }))}
      />

      {result.posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            条件に一致する投稿がありません。フィルタを変更するか、投稿を登録してください。
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800">
                <th className="p-3">投稿</th>
                <th className="p-3 text-right">スコア</th>
                <th className="p-3 text-right">再生数</th>
                <th className="p-3 text-right">直近増加</th>
                <th className="p-3 text-right">増加/時</th>
                <th className="p-3 text-right">Fw倍率</th>
                <th className="p-3 text-right">尺</th>
                <th className="p-3">テーマ/フック/CTA</th>
                <th className="p-3">判定</th>
                <th className="p-3">最終取得</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.posts.map((post) => {
                const analysis = post.analyses[0];
                return (
                  <tr
                    key={post.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="max-w-[280px] p-3">
                      <Link
                        href={`/posts/${post.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {post.caption?.slice(0, 50) || "（キャプションなし）"}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        @{post.account.username}・Fw
                        {formatNumber(post.account.followersCount)}・
                        {formatDateTime(post.postedAt)}
                      </p>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {post.latestMetric?.trendScore?.toFixed(1) ?? "—"}
                    </td>
                    <td className="p-3 text-right">
                      {formatNumber(post.latestMetric?.views)}
                    </td>
                    <td className="p-3 text-right">
                      {post.latestMetric?.viewsDelta != null
                        ? `+${formatNumber(post.latestMetric.viewsDelta)}`
                        : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {post.latestMetric?.viewsPerHour != null
                        ? formatNumber(Math.round(post.latestMetric.viewsPerHour))
                        : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {post.latestMetric?.followerRatio != null
                        ? `${post.latestMetric.followerRatio.toFixed(1)}x`
                        : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {formatDuration(post.durationSeconds)}
                    </td>
                    <td className="max-w-[200px] p-3">
                      {analysis ? (
                        <div className="flex flex-wrap gap-1">
                          {analysis.themes.slice(0, 2).map((t) => (
                            <Badge
                              key={t}
                              className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                            >
                              {t}
                            </Badge>
                          ))}
                          {analysis.hookType && (
                            <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              {analysis.hookType}
                            </Badge>
                          )}
                          {analysis.ctaType && (
                            <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {analysis.ctaType}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">未分析</span>
                      )}
                    </td>
                    <td className="p-3">
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
                    </td>
                    <td className="p-3 text-xs text-slate-500">
                      {formatDateTime(post.lastFetchedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          page={filter.page}
          totalPages={totalPages}
          params={params}
        />
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: SearchParams;
}) {
  const makeHref = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string" && v) sp.set(k, v);
    }
    sp.set("page", String(p));
    return `/posts?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-center gap-4 text-sm">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className="text-indigo-600 hover:underline">
          ← 前へ
        </Link>
      ) : (
        <span className="text-slate-300">← 前へ</span>
      )}
      <span className="text-slate-500">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={makeHref(page + 1)} className="text-indigo-600 hover:underline">
          次へ →
        </Link>
      ) : (
        <span className="text-slate-300">次へ →</span>
      )}
    </div>
  );
}
