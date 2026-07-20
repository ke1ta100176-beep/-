/** ページ遷移中に即座に表示されるスケルトン（体感速度の改善） */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-7 w-48 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>
      <div className="h-72 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      <p className="text-center text-sm text-slate-400">読み込み中...</p>
    </div>
  );
}
