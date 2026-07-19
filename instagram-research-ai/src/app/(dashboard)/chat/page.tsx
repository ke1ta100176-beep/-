import { ChatPanel } from "@/components/chat/ChatPanel";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">AIチャット</h1>
        <p className="mt-1 text-sm text-slate-500">
          保存された投稿データベースに自然言語で質問できます。回答は必ずデータベース検索に基づき、根拠投稿へのリンク付きで返されます。
        </p>
      </div>
      <ChatPanel />
    </div>
  );
}
