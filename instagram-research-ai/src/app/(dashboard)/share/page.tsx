"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * PWA共有ターゲット（Android）。共有シートから起動され、
 * text/url パラメータからInstagram URLを抽出してセッション認証で登録する。
 */
function ShareReceiver() {
  const searchParams = useSearchParams();
  const sharedUrl = useMemo(() => {
    const text = searchParams.get("text") ?? "";
    const url = searchParams.get("url") ?? "";
    const match = `${url} ${text}`.match(
      /https:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?\S*/
    );
    return match?.[0] ?? null;
  }, [searchParams]);

  const [status, setStatus] = useState<"working" | "done" | "error">(
    sharedUrl ? "working" : "error"
  );
  const [message, setMessage] = useState(
    sharedUrl
      ? "投稿を登録しています..."
      : "共有された内容からInstagram投稿URLが見つかりませんでした。"
  );
  const [postId, setPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!sharedUrl) return;

    fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sharedUrl }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error ?? "登録に失敗しました。");
        } else {
          setStatus("done");
          setPostId(data.postId);
          setMessage(
            data.created
              ? "投稿を登録しました。AI分析を開始します。"
              : "既存の投稿でした。数値を再取得しました。"
          );
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("通信エラーが発生しました。");
      });
  }, [sharedUrl]);

  return (
    <Card className="mx-auto mt-8 max-w-md">
      <CardHeader>
        <CardTitle>Instagramから共有</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={`text-sm ${status === "error" ? "text-red-600" : ""}`}>
          {message}
        </p>
        <div className="flex gap-3 text-sm">
          {postId && (
            <Link
              href={`/posts/${postId}`}
              className="text-indigo-600 hover:underline"
            >
              投稿詳細を見る
            </Link>
          )}
          <Link href="/posts" className="text-slate-500 hover:underline">
            投稿一覧へ
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SharePage() {
  return (
    <Suspense>
      <ShareReceiver />
    </Suspense>
  );
}
