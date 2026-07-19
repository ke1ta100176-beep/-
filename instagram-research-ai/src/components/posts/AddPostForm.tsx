"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 手動URL登録 + CSVインポート */
export function AddPostForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "登録に失敗しました");
      } else {
        setMessage(data.created ? "登録しました" : "既存の投稿でした（数値を再取得）");
        setUrl("");
        router.refresh();
      }
    } catch {
      setMessage("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const uploadCsv = async (file: File) => {
    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/csv-import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "インポートに失敗しました");
      } else {
        const errorNote =
          data.rowErrors?.length > 0
            ? `（${data.rowErrors.length}行はエラーでスキップ）`
            : "";
        setMessage(
          `CSV取込完了: 新規${data.created}件・既存${data.updated}件・履歴追記${data.metricsAppended}件${errorNote}`
        );
        router.refresh();
      }
    } catch {
      setMessage("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <form onSubmit={submitUrl} className="flex items-center gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.instagram.com/reel/..."
          className="w-72"
          type="url"
        />
        <Button type="submit" size="sm" disabled={loading || !url}>
          URL登録
        </Button>
        <label className="cursor-pointer">
          <span className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            CSVインポート
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadCsv(file);
              e.target.value = "";
            }}
          />
        </label>
      </form>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
