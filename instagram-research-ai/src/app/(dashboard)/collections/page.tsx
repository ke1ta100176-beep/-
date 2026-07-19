import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { NewCollectionForm } from "@/components/collections/NewCollectionForm";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const collections = await prisma.collection.findMany({
    include: { _count: { select: { posts: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">コレクション</h1>
        <NewCollectionForm />
      </div>

      {collections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            コレクションがありません。「夏レシピ」「妻ウケ」「企画候補」など、
            リサーチの切り口ごとに投稿を整理できます。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <h2 className="font-semibold">{c.name}</h2>
                  {c.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {c.description}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-slate-400">
                    {c._count.posts}件の投稿・{formatDate(c.updatedAt)}更新
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
