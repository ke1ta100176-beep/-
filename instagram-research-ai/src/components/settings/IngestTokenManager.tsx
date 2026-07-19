"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TokenRow {
  id: string;
  label: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** シェア受け口トークンの発行・失効。平文は発行直後のみ表示。 */
export function IngestTokenManager() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    return fetch("/api/settings/ingest-tokens")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setTokens(data.tokens ?? []);
        }
      })
      .catch(() => {
        // 一覧取得失敗は致命的でないため無視
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const issue = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/ingest-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "シェア用トークン" }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewToken(data.token);
        await load();
      }
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("このトークンを失効させますか？共有済みのショートカットは使えなくなります。")) return;
    await fetch("/api/settings/ingest-tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const ingestUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/ingest`
      : "/api/ingest";

  return (
    <Card>
      <CardHeader>
        <CardTitle>シェア受け口（Instagramから共有して保存）</CardTitle>
        <p className="text-xs text-slate-500">
          Instagramアプリの共有ボタンから投稿URLをこのシステムへ送ると、自動で登録・AI分類されます。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
          <p className="font-medium">設定手順:</p>
          <ol className="mt-1 list-inside list-decimal space-y-1">
            <li>下の「トークンを発行」を押し、表示されたトークンをコピー</li>
            <li>
              <strong>iPhone:</strong> ショートカットアプリで「共有シートに表示」をONにした新規ショートカットを作成し、「URLの内容を取得」アクションで {ingestUrl}?token=（トークン） へPOST（本文=共有されたURL）
            </li>
            <li>
              <strong>Android:</strong> このサイトをホーム画面に追加（PWA）すると共有メニューに表示されます
            </li>
            <li>Instagramの投稿 → 共有 → 作成したショートカット/このアプリを選択</li>
          </ol>
          <p className="mt-2">詳細な手順はREADMEの「シェア受け口の設定」を参照してください。</p>
        </div>

        {newToken && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-900/30">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              新しいトークン（この画面でしか表示されません。今すぐコピーしてください）:
            </p>
            <code className="mt-1 block break-all rounded bg-white p-2 font-mono dark:bg-slate-900">
              {newToken}
            </code>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={issue} disabled={loading}>
            トークンを発行
          </Button>
        </div>

        {tokens.length > 0 && (
          <ul className="space-y-1 text-xs text-slate-500">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span>
                  {t.label ?? "トークン"}（
                  {new Date(t.createdAt).toLocaleDateString("ja-JP")}発行・
                  {t.revokedAt
                    ? "失効済み"
                    : t.lastUsedAt
                      ? `最終使用 ${new Date(t.lastUsedAt).toLocaleDateString("ja-JP")}`
                      : "未使用"}
                  ）
                </span>
                {!t.revokedAt && (
                  <button
                    onClick={() => revoke(t.id)}
                    className="text-red-500 underline"
                  >
                    失効
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
