import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateReportButton } from "@/components/reports/GenerateReportButton";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await prisma.report.findMany({
    orderBy: { targetDate: "desc" },
    take: 14,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">日次レポート</h1>
          <p className="mt-1 text-sm text-slate-500">
            毎朝の定期ジョブで自動生成されます（手動生成も可能）。Slack等への通知は今後対応予定です。
          </p>
        </div>
        <GenerateReportButton />
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            レポートがまだありません。「今すぐ生成」を押すか、定期ジョブの実行を待ってください。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader>
                <CardTitle>{formatDate(report.targetDate)} のレポート</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {report.reportText}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
