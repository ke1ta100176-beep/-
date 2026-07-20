/** 投稿詳細の読み込み中スケルトン */
export default function PostDetailLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-5 w-32 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-7 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          />
        ))}
      </div>
      <div className="h-80 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      <p className="text-center text-sm text-slate-400">読み込み中...</p>
    </div>
  );
}
