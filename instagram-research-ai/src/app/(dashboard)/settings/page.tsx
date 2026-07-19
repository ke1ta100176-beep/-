import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveScoringPolicy } from "@/server/scoring/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoringPolicyEditor } from "@/components/settings/ScoringPolicyEditor";
import { IngestTokenManager } from "@/components/settings/IngestTokenManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "admin";

  const [policy, versions, jobRuns] = await Promise.all([
    getActiveScoringPolicy(),
    prisma.scoringConfig.findMany({
      orderBy: { version: "desc" },
      take: 5,
      select: { version: true, isActive: true, note: true, createdAt: true },
    }),
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">設定</h1>

      <Card>
        <CardHeader>
          <CardTitle>AI・データ取得（環境変数で管理）</CardTitle>
          <p className="text-xs text-slate-500">
            APIキーはセキュリティのため画面から設定できません。サーバーの環境変数で設定してください（READMEの手順参照）。
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <EnvRow
              label="Anthropic APIキー"
              value={
                process.env.ANTHROPIC_API_KEY
                  ? "設定済み（sk-****）"
                  : "未設定（スタブAIで動作中）"
              }
              ok={Boolean(process.env.ANTHROPIC_API_KEY)}
            />
            <EnvRow
              label="AIモデル"
              value={process.env.AI_MODEL ?? "claude-sonnet-5"}
              ok
            />
            <EnvRow
              label="データ取得元"
              value={process.env.DATA_SOURCE ?? "mock"}
              ok
            />
            <EnvRow
              label="タイムゾーン"
              value={process.env.APP_TIMEZONE ?? "Asia/Tokyo"}
              ok
            />
          </dl>
        </CardContent>
      </Card>

      <IngestTokenManager />

      <Card>
        <CardHeader>
          <CardTitle>トレンドスコア・分類基準（バージョン管理）</CardTitle>
          <p className="text-xs text-slate-500">
            現在アクティブ: v{policy.version}。変更すると新バージョンが作成され、過去のスコアは元のバージョンで再現可能なまま保持されます。
          </p>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <ScoringPolicyEditor policy={policy} />
          ) : (
            <p className="text-sm text-slate-500">
              スコア設定の変更は admin ロールのみ可能です。
            </p>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-medium text-slate-500">バージョン履歴</p>
            <ul className="space-y-1 text-xs text-slate-500">
              {versions.map((v) => (
                <li key={v.version}>
                  v{v.version}
                  {v.isActive && (
                    <Badge className="ml-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      アクティブ
                    </Badge>
                  )}
                  {v.note && ` — ${v.note}`}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ジョブ実行履歴</CardTitle>
          <p className="text-xs text-slate-500">
            定期実行の設定方法はREADMEの「定期ジョブの実行方法」を参照してください。
          </p>
        </CardHeader>
        <CardContent>
          {jobRuns.length === 0 ? (
            <p className="text-sm text-slate-500">実行履歴がまだありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="p-2">ジョブ</th>
                    <th className="p-2">状態</th>
                    <th className="p-2 text-right">対象</th>
                    <th className="p-2 text-right">成功</th>
                    <th className="p-2 text-right">失敗</th>
                    <th className="p-2 text-right">コスト($)</th>
                    <th className="p-2">開始</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {jobRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="p-2 font-mono">{run.jobType}</td>
                      <td className="p-2">
                        <Badge
                          className={
                            run.status === "success"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : run.status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          }
                        >
                          {run.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{run.targetCount}</td>
                      <td className="p-2 text-right">{run.successCount}</td>
                      <td className="p-2 text-right">{run.failureCount}</td>
                      <td className="p-2 text-right">
                        {run.approxCostUsd?.toFixed(4) ?? "—"}
                      </td>
                      <td className="p-2 text-slate-500">
                        {run.startedAt.toLocaleString("ja-JP")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EnvRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 ${ok ? "" : "text-amber-600"}`}>{value}</dd>
    </div>
  );
}
