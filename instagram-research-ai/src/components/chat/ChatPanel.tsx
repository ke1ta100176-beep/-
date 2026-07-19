"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

interface ReferencedPost {
  id: string;
  username: string;
  caption: string | null;
  views: number | null;
  trendScore: number | null;
  instagramUrl: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  referencedPosts?: ReferencedPost[];
}

const EXAMPLE_QUESTIONS = [
  "直近14日で増えているテーマは？",
  "フォロワー1万人以下で急上昇している投稿は？",
  "動画尺30秒以内で伸びている投稿を教えて",
  "保存CTAを使って伸びた投稿の共通点は？",
];

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setError(null);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: sessionId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "回答の生成に失敗しました");
        return;
      }
      setSessionId(data.sessionId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.text,
          referencedPosts: data.referencedPosts,
        },
      ]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-180px)] flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">質問例:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <div
            key={i}
            className={message.role === "user" ? "flex justify-end" : ""}
          >
            <div
              className={
                message.role === "user"
                  ? "max-w-[80%] rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
                  : "max-w-[90%]"
              }
            >
              {message.role === "assistant" ? (
                <AssistantMessage message={message} />
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <p className="text-sm text-slate-500">
            データベースを検索して回答を生成中...
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="データベースへの質問を入力（Enterで送信 / Shift+Enterで改行）"
          rows={2}
          className="flex-1 resize-none"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          送信
        </Button>
      </form>
    </div>
  );
}

/** [POST:id] 引用をリンクへ変換して表示 */
function AssistantMessage({ message }: { message: Message }) {
  const parts = message.content.split(/(\[POST:[a-z0-9]+\])/gi);
  return (
    <div className="space-y-3">
      <div className="whitespace-pre-wrap rounded-lg bg-slate-100 px-4 py-3 text-sm dark:bg-slate-800">
        {parts.map((part, i) => {
          const m = part.match(/^\[POST:([a-z0-9]+)\]$/i);
          if (m) {
            return (
              <Link
                key={i}
                href={`/posts/${m[1]}`}
                className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                [投稿を見る]
              </Link>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>

      {message.referencedPosts && message.referencedPosts.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-slate-500">根拠となった投稿:</p>
          <div className="grid gap-2 md:grid-cols-2">
            {message.referencedPosts.slice(0, 6).map((post) => (
              <Card key={post.id} className="text-xs">
                <CardContent className="p-2">
                  <Link
                    href={`/posts/${post.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {post.caption || "（キャプションなし）"}
                  </Link>
                  <p className="mt-0.5 text-slate-500">
                    @{post.username}・{formatNumber(post.views)}再生
                    {post.trendScore != null &&
                      `・スコア${post.trendScore.toFixed(0)}`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
