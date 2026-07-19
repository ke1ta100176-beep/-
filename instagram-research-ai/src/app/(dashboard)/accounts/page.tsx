import { prisma } from "@/lib/prisma";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  AccountEditButton,
  AccountManager,
} from "@/components/accounts/AccountManager";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, categories, groups] = await Promise.all([
    prisma.account.findMany({
      include: {
        category: true,
        benchmarkGroup: true,
        _count: { select: { posts: true } },
      },
      orderBy: [{ isActive: "desc" }, { followersCount: "desc" }],
      take: 500,
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.benchmarkGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        ベンチマークアカウント
        <span className="ml-2 text-sm font-normal text-slate-500">
          {accounts.length}件
        </span>
      </h1>

      <AccountManager
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800">
              <th className="p-3">アカウント</th>
              <th className="p-3 text-right">フォロワー</th>
              <th className="p-3">カテゴリ</th>
              <th className="p-3">グループ</th>
              <th className="p-3 text-right">投稿数</th>
              <th className="p-3">状態</th>
              <th className="p-3">最終取得</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {accounts.map((account) => (
              <tr key={account.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="p-3">
                  <a
                    href={account.profileUrl ?? `https://www.instagram.com/${account.username}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline"
                  >
                    @{account.username}
                  </a>
                  <p className="text-xs text-slate-500">{account.displayName}</p>
                </td>
                <td className="p-3 text-right">
                  {formatNumber(account.followersCount)}
                </td>
                <td className="p-3">{account.category?.name ?? "—"}</td>
                <td className="p-3">{account.benchmarkGroup?.name ?? "—"}</td>
                <td className="p-3 text-right">{account._count.posts}</td>
                <td className="p-3">
                  {account.isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      有効
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      無効
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-xs text-slate-500">
                  {formatDateTime(account.lastCheckedAt)}
                </td>
                <td className="p-3">
                  <AccountEditButton
                    account={{
                      id: account.id,
                      username: account.username,
                      displayName: account.displayName ?? "",
                      followersCount: account.followersCount,
                      categoryId: account.categoryId,
                      benchmarkGroupId: account.benchmarkGroupId,
                      isActive: account.isActive,
                    }}
                    categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                    groups={groups.map((g) => ({ id: g.id, name: g.name }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {accounts.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500">
            アカウントが未登録です。上のフォームから追加してください。
          </p>
        )}
      </div>
    </div>
  );
}
