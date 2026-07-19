"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewCollectionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setName("");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "作成に失敗しました");
      }
    } catch {
      setError("通信エラー");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="新しいコレクション名"
        className="w-56"
        required
        maxLength={100}
      />
      <Button type="submit" size="sm" disabled={loading || !name}>
        作成
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
