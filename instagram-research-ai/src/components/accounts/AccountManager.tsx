"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

interface Option {
  id: string;
  name: string;
}

interface AccountData {
  id: string;
  username: string;
  displayName: string;
  followersCount: number;
  categoryId: string | null;
  benchmarkGroupId: string | null;
  isActive: boolean;
}

/** アカウント追加フォーム＋カテゴリ/グループ追加 */
export function AccountManager({
  categories,
  groups,
}: {
  categories: Option[];
  groups: Option[];
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [followers, setFollowers] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          followersCount: followers ? Number(followers) : 0,
          categoryId: categoryId || null,
          benchmarkGroupId: groupId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "登録に失敗しました");
      } else {
        setMessage(`@${username} を登録しました`);
        setUsername("");
        setFollowers("");
        router.refresh();
      }
    } catch {
      setMessage("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const addTaxonomy = async (kind: "category" | "benchmarkGroup") => {
    const name = window.prompt(
      kind === "category" ? "新しいカテゴリ名" : "新しいグループ名"
    );
    if (!name) return;
    const res = await fetch("/api/taxonomies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, name }),
    });
    if (res.ok) router.refresh();
    else {
      const data = await res.json();
      setMessage(data.error ?? "追加に失敗しました");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Instagramユーザー名"
        className="w-48"
        required
        pattern="[A-Za-z0-9._]+"
        title="半角英数字・ピリオド・アンダースコアのみ"
      />
      <Input
        value={followers}
        onChange={(e) => setFollowers(e.target.value)}
        placeholder="フォロワー数"
        type="number"
        min={0}
        className="w-32"
      />
      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">カテゴリなし</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => addTaxonomy("category")}
        title="カテゴリを追加"
      >
        +カテゴリ
      </Button>
      <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
        <option value="">グループなし</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => addTaxonomy("benchmarkGroup")}
        title="グループを追加"
      >
        +グループ
      </Button>
      <Button type="submit" size="sm" disabled={loading || !username}>
        アカウント追加
      </Button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </form>
  );
}

/** 行内編集ボタン（有効/無効切替・カテゴリ/グループ変更） */
export function AccountEditButton({
  account,
  categories,
  groups,
}: {
  account: AccountData;
  categories: Option[];
  groups: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = async (patch: Record<string, unknown>) => {
    setLoading(true);
    try {
      await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      router.refresh();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        編集
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Select
        defaultValue={account.categoryId ?? ""}
        onChange={(e) => update({ categoryId: e.target.value || null })}
        disabled={loading}
        className="h-8 text-xs"
      >
        <option value="">カテゴリなし</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        defaultValue={account.benchmarkGroupId ?? ""}
        onChange={(e) => update({ benchmarkGroupId: e.target.value || null })}
        disabled={loading}
        className="h-8 text-xs"
      >
        <option value="">グループなし</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => update({ isActive: !account.isActive })}
      >
        {account.isActive ? "無効化" : "有効化"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        閉じる
      </Button>
    </div>
  );
}
