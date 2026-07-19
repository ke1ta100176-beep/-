"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

interface CollectionOption {
  id: string;
  name: string;
}

/** 投稿をコレクションへ追加するピッカー */
export function CollectionPicker({ postId }: { postId: string }) {
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/collections")
      .then((res) => res.json())
      .then((data) =>
        setCollections(
          (data.collections ?? []).map((c: CollectionOption) => ({
            id: c.id,
            name: c.name,
          }))
        )
      )
      .catch(() => setCollections([]));
  }, []);

  const add = async () => {
    if (!selected) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/collections/${selected}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (res.ok) {
        setMessage("追加しました");
        router.refresh();
      } else {
        const data = await res.json();
        setMessage(data.error ?? "追加に失敗しました");
      }
    } catch {
      setMessage("通信エラー");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-44"
        aria-label="追加先コレクション"
      >
        <option value="">コレクションを選択</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="outline" onClick={add} disabled={!selected || loading}>
        追加
      </Button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
