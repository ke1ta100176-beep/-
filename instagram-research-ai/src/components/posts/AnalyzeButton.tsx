"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** AIタグ付けの実行・再実行ボタン */
export function AnalyzeButton({
  postId,
  hasAnalysis,
}: {
  postId: string;
  hasAnalysis: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "分析に失敗しました");
      } else if (data.status === "failed") {
        setError("AI分析が失敗しました。再実行してください。");
        router.refresh();
      } else {
        router.refresh();
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={run} disabled={loading}>
        {loading
          ? "分析中..."
          : hasAnalysis
            ? "AI分析を再実行"
            : "AI分析を実行"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
