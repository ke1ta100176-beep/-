"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { HOOK_TYPES, CTA_TYPES } from "@/lib/taxonomies";

const SORT_OPTIONS = [
  { value: "trendScore", label: "トレンドスコア順" },
  { value: "postedAt", label: "投稿日時順" },
  { value: "views", label: "再生数順" },
  { value: "viewsPerHour", label: "再生増加速度順" },
  { value: "followerRatio", label: "フォロワー倍率順" },
];

interface Option {
  slug: string;
  name: string;
}

export function PostFilterBar({
  categories,
  groups,
}: {
  categories: Option[];
  groups: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const get = (key: string) => searchParams.get(key) ?? "";

  const apply = (formData: FormData) => {
    const sp = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value !== "") sp.set(key, value);
    }
    router.push(`/posts?${sp.toString()}`);
  };

  return (
    <form
      action={apply}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          placeholder="キーワード（キャプション・テーマ・アカウント）"
          defaultValue={get("q")}
          className="w-64"
        />
        <Select name="sortBy" defaultValue={get("sortBy") || "trendScore"}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select name="class" defaultValue={get("class")}>
          <option value="">判定: すべて</option>
          <option value="grew">伸びた</option>
          <option value="normal">通常</option>
          <option value="underperformed">伸び悩み</option>
          <option value="too_early">判定前</option>
        </Select>
        <Select name="analyzed" defaultValue={get("analyzed")}>
          <option value="">AI分析: すべて</option>
          <option value="true">分析済み</option>
          <option value="false">未分析</option>
        </Select>
        <Button type="submit" size="sm">
          絞り込む
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "詳細条件を閉じる" : "詳細条件"}
        </Button>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 md:grid-cols-4">
          <Select name="category" defaultValue={get("category")}>
            <option value="">カテゴリ: すべて</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="group" defaultValue={get("group")}>
            <option value="">グループ: すべて</option>
            {groups.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select name="hook" defaultValue={get("hook")}>
            <option value="">フック: すべて</option>
            {HOOK_TYPES.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
          <Select name="cta" defaultValue={get("cta")}>
            <option value="">CTA: すべて</option>
            {CTA_TYPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            name="postedAfter"
            type="date"
            defaultValue={get("postedAfter")}
            title="投稿日（この日以降）"
          />
          <Input
            name="postedBefore"
            type="date"
            defaultValue={get("postedBefore")}
            title="投稿日（この日以前）"
          />
          <Input
            name="minFollowers"
            type="number"
            placeholder="フォロワー下限"
            defaultValue={get("minFollowers")}
          />
          <Input
            name="maxFollowers"
            type="number"
            placeholder="フォロワー上限"
            defaultValue={get("maxFollowers")}
          />
          <Input
            name="minViews"
            type="number"
            placeholder="再生数下限"
            defaultValue={get("minViews")}
          />
          <Input
            name="maxDuration"
            type="number"
            placeholder="動画尺上限（秒）"
            defaultValue={get("maxDuration")}
          />
          <Input
            name="minTrendScore"
            type="number"
            placeholder="スコア下限"
            defaultValue={get("minTrendScore")}
          />
          <Input
            name="theme"
            placeholder="テーマ（完全一致）"
            defaultValue={get("theme")}
          />
        </div>
      )}
    </form>
  );
}
