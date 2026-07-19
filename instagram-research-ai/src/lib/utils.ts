import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return n.toLocaleString("ja-JP");
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  return `${seconds}秒`;
}

export const PERFORMANCE_CLASS_LABELS: Record<string, string> = {
  grew: "伸びた",
  normal: "通常",
  underperformed: "伸び悩み",
  too_early: "判定前",
  insufficient_data: "データ不足",
};

export const PERFORMANCE_CLASS_COLORS: Record<string, string> = {
  grew: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  normal: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  underperformed:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  too_early: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  insufficient_data:
    "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};
