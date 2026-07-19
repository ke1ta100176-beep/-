"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScoringPolicy } from "@/server/scoring/types";

const WEIGHT_FIELDS = [
  { key: "velocity", label: "増加速度の重み" },
  { key: "growth", label: "増加率の重み" },
  { key: "followerRatio", label: "フォロワー倍率の重み" },
  { key: "accountBaseline", label: "アカウント平均比の重み" },
  { key: "freshness", label: "鮮度の重み" },
  { key: "velocityNorm", label: "速度の飽和値（views/時）" },
  { key: "growthCap", label: "増加率の上限" },
  { key: "followerRatioNorm", label: "フォロワー倍率の飽和値" },
  { key: "baselineDeltaCap", label: "平均比の上限" },
  { key: "freshnessWindowHours", label: "鮮度ウィンドウ（時間）" },
] as const;

const THRESHOLD_FIELDS = [
  { key: "grewRatio", label: "「伸びた」倍率しきい値" },
  { key: "underperformRatio", label: "「伸び悩み」倍率しきい値" },
  { key: "minElapsedHours", label: "判定までの最低経過時間" },
  { key: "minSampleSize", label: "アカウント基準の最低投稿数" },
  { key: "trailingWindow", label: "基準に使う直近投稿数" },
  { key: "followerDriftRatio", label: "フォロワー変動しきい値" },
  { key: "madOutlierFactor", label: "外れ値除外係数（MAD）" },
] as const;

export function ScoringPolicyEditor({ policy }: { policy: ScoringPolicy }) {
  const router = useRouter();
  const [weights, setWeights] = useState<Record<string, number>>(
    policy.weights as unknown as Record<string, number>
  );
  const [thresholds, setThresholds] = useState<Record<string, number>>(
    policy.classificationThresholds as unknown as Record<string, number>
  );
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weights,
          classificationThresholds: thresholds,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "保存に失敗しました");
      } else {
        setMessage(
          `新バージョン v${data.policy.version} を作成しました。スコア再計算ジョブ実行後に反映されます。`
        );
        router.refresh();
      }
    } catch {
      setMessage("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">
          トレンドスコアの重み（上5つの合計が1になるようにしてください）
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {WEIGHT_FIELDS.map((f) => (
            <label key={f.key} className="text-xs">
              <span className="text-slate-500">{f.label}</span>
              <Input
                type="number"
                step="0.01"
                value={weights[f.key] ?? 0}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, [f.key]: Number(e.target.value) }))
                }
                className="mt-0.5"
              />
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">成功・伸び悩み分類</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {THRESHOLD_FIELDS.map((f) => (
            <label key={f.key} className="text-xs">
              <span className="text-slate-500">{f.label}</span>
              <Input
                type="number"
                step="0.1"
                value={thresholds[f.key] ?? 0}
                onChange={(e) =>
                  setThresholds((t) => ({
                    ...t,
                    [f.key]: Number(e.target.value),
                  }))
                }
                className="mt-0.5"
              />
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="変更メモ（任意）"
          className="w-64"
          maxLength={300}
        />
        <Button size="sm" onClick={save} disabled={loading}>
          新バージョンとして保存
        </Button>
      </div>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
