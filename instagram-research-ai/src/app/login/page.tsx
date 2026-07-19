"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 初回デプロイ直後（ユーザー0人）は初回セットアップ画面へ誘導する
  useEffect(() => {
    fetch("/api/setup", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.needsSetup) router.replace("/setup");
      })
      .catch(() => {
        // 確認失敗時は通常のログイン画面のまま
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      // 失敗原因を切り分けて、内部エラーと入力ミスを区別して表示する
      try {
        const res = await fetch("/api/login-diagnose", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.reason === "db_error") {
          setError(
            "データベース接続でエラーが発生しました。数秒待ってからもう一度お試しください。"
          );
        } else if (data.reason === "ok") {
          setError(
            "認証情報は正しいのに認証処理でエラーが発生しました（内部エラー）。この画面を再読み込みして再試行してください。"
          );
        } else {
          setError("メールアドレスまたはパスワードが正しくありません");
        }
      } catch {
        setError("メールアドレスまたはパスワードが正しくありません");
      }
      return;
    }
    // オープンリダイレクト対策: 同一オリジンのパスのみ許可（"//evil.com" も拒否）
    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    const safeUrl =
      callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/";
    router.push(safeUrl);
    router.refresh();
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Instagram Research AI</CardTitle>
        <p className="text-sm text-slate-500">社内リサーチツールにログイン</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              メールアドレス
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              パスワード
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "ログイン中..." : "ログイン"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
