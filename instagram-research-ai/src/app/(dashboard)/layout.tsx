import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/posts", label: "投稿一覧" },
  { href: "/accounts", label: "アカウント" },
  { href: "/collections", label: "コレクション" },
  { href: "/chat", label: "AIチャット" },
  { href: "/reports", label: "レポート" },
  { href: "/settings", label: "設定" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-52 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:block">
        <div className="mb-6">
          <h1 className="text-sm font-bold leading-tight">
            Instagram
            <br />
            Research AI
          </h1>
          <p className="mt-1 text-xs text-slate-500">社内リサーチOS</p>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="mb-2 truncate text-xs text-slate-500">
            {session.user.email}（{session.user.role}）
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="text-xs text-slate-500 underline hover:text-slate-700">
              ログアウト
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-3 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-300"
            >
              {item.label}
            </Link>
          ))}
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
