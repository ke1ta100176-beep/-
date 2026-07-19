"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/utils";

export interface MetricPoint {
  measuredAt: string;
  hoursSincePosted: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
}

/** 投稿詳細の数値推移グラフ（再生数・いいね数・コメント数） */
export function MetricsHistoryChart({ points }: { points: MetricPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        数値履歴がまだありません。データ取得ジョブの実行後に表示されます。
      </p>
    );
  }

  const data = points.map((p) => ({
    label:
      p.hoursSincePosted !== null
        ? p.hoursSincePosted < 48
          ? `${Math.round(p.hoursSincePosted)}h`
          : `${Math.round(p.hoursSincePosted / 24)}d`
        : new Date(p.measuredAt).toLocaleDateString("ja-JP"),
    再生数: p.views,
    いいね: p.likes,
    コメント: p.comments,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#94a3b830" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fontSize: 12 }}
            width={56}
          />
          <Tooltip
            formatter={(value) => formatNumber(value as number)}
            labelFormatter={(label) => `投稿から ${label}`}
          />
          <Line
            type="monotone"
            dataKey="再生数"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="いいね"
            stroke="#059669"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="コメント"
            stroke="#d97706"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
