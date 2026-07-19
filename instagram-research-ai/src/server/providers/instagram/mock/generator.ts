import { hashString, mulberry32, pick, pickMany, randInt } from "./random";

/**
 * モックデータ生成器。
 * シード固定の決定的PRNGで、成長カーブの異なる投稿群を再現可能に生成する。
 * UI・スコア計算・分類ロジックの検証に使える現実的な分布を目指す。
 */

export type GrowthCurveType =
  | "strong_initial"
  | "delayed_breakout"
  | "fade_after_start"
  | "steady"
  | "small_account_anomaly"
  | "underperformer";

export const SNAPSHOT_HOURS = [6, 12, 24, 48, 72, 168, 336] as const;

export interface MockAccount {
  username: string;
  displayName: string;
  followersCount: number;
  categorySlug: string;
  benchmarkGroupSlug: string;
  genreSlug: string;
}

export interface MockPost {
  username: string;
  platformPostId: string;
  instagramUrl: string;
  postedAt: Date;
  caption: string;
  hashtags: string[];
  audioName: string;
  durationSeconds: number;
  curveType: GrowthCurveType;
  finalViews: number;
  /** 経過時間(h)→累計再生数 */
  viewsAt: (hours: number) => number;
  likesRate: number;
  commentsRate: number;
}

interface GenreBank {
  genreSlug: string;
  categorySlug: string;
  groups: string[];
  themes: string[];
  hooks: string[];
  hashtags: string[];
}

const GENRE_BANKS: GenreBank[] = [
  {
    genreSlug: "recipe",
    categorySlug: "recipe",
    groups: [
      "tsuma-uke-recipe",
      "jitan-recipe",
      "diet-recipe",
      "bread",
      "sweets",
      "koji",
      "beginner-cooking",
    ],
    themes: [
      "そうめんアレンジ", "冷製パスタ", "火を使わないおかず", "大葉レシピ",
      "とうもろこしごはん", "枝豆おつまみ", "鶏むね肉の節約おかず", "レンジで完結",
      "作り置き1週間", "麹の万能だれ", "米粉パン", "低糖質スイーツ",
    ],
    hooks: [
      "まだ茹でてるの？", "実はこれ、混ぜるだけ", "知らないと損する",
      "夫が3杯おかわりした", "妻が無言で完食した", "NGな作り方してない？",
      "初心者でも失敗しない", "10分で完成",
    ],
    hashtags: ["#簡単レシピ", "#時短レシピ", "#節約ごはん", "#夏レシピ", "#作り置き", "#おうちごはん"],
  },
  {
    genreSlug: "fitness",
    categorySlug: "fitness",
    groups: ["fitness"],
    themes: [
      "1分お腹痩せ", "寝ながら脚痩せ", "肩こり解消ストレッチ", "産後の骨盤ケア",
      "二の腕引き締め", "朝のルーティン", "スクワット30日チャレンジ",
    ],
    hooks: [
      "まだ腹筋してるの？", "実は逆効果なんです", "1日1分でOK",
      "3週間で変わった", "整体師が教える", "運動嫌いでも続く",
    ],
    hashtags: ["#宅トレ", "#ダイエット", "#ストレッチ", "#ボディメイク", "#痩せる習慣"],
  },
  {
    genreSlug: "lifestyle",
    categorySlug: "lifestyle",
    groups: ["lifestyle"],
    themes: [
      "100均収納アイデア", "冷蔵庫の整理術", "洗面所の掃除ルーティン",
      "ズボラでも続く家事", "無印良品の神アイテム", "子ども服の収納",
    ],
    hooks: [
      "捨てないで！", "知らないと損", "実はこれ1つで解決",
      "収納のプロが教える", "プロより簡単な方法", "もう散らからない",
    ],
    hashtags: ["#収納術", "#暮らしを整える", "#100均", "#掃除記録", "#シンプルライフ"],
  },
  {
    genreSlug: "recipe",
    categorySlug: "student",
    groups: ["student-accounts"],
    themes: ["初投稿レシピ", "練習企画", "定番おかず", "朝ごはんアイデア"],
    hooks: ["作ってみた", "初心者ですが", "簡単なので見てください", "10分レシピ"],
    hashtags: ["#料理初心者", "#レシピ勉強中", "#おうちごはん"],
  },
];

const AUDIO_NAMES = [
  "オリジナル音源", "Trending Sound A", "Summer Vibes", "Chill Beat",
  "人気BGM 2026", "Cooking ASMR",
];

const CURVE_DISTRIBUTION: { type: GrowthCurveType; weight: number }[] = [
  { type: "strong_initial", weight: 0.2 },
  { type: "delayed_breakout", weight: 0.12 },
  { type: "fade_after_start", weight: 0.15 },
  { type: "steady", weight: 0.28 },
  { type: "small_account_anomaly", weight: 0.05 },
  { type: "underperformer", weight: 0.2 },
];

function pickCurve(rng: () => number): GrowthCurveType {
  const r = rng();
  let acc = 0;
  for (const { type, weight } of CURVE_DISTRIBUTION) {
    acc += weight;
    if (r <= acc) return type;
  }
  return "steady";
}

/** 成長カーブ: 経過時間(h)に対する累計再生数の割合(0〜1) */
export function curveProgress(type: GrowthCurveType, hours: number): number {
  const t = Math.max(0, hours);
  switch (type) {
    case "strong_initial":
      return 1 - Math.exp(-t / 18);
    case "delayed_breakout":
      // 〜24hはほぼ横ばい、24-72hで急伸するシグモイド
      return 1 / (1 + Math.exp(-(t - 48) / 10));
    case "fade_after_start":
      // 初速で7割に到達後、残りは低速の線形
      return 0.7 * (1 - Math.exp(-t / 10)) + 0.3 * Math.min(1, t / 336);
    case "steady":
      return Math.min(1, t / 336);
    case "small_account_anomaly":
      return 1 - Math.exp(-t / 24);
    case "underperformer":
      return 1 - Math.exp(-t / 20);
  }
}

function finalViewsFor(
  type: GrowthCurveType,
  followers: number,
  rng: () => number
): number {
  const base = followers * (0.3 + rng() * 0.7);
  switch (type) {
    case "strong_initial":
      return Math.round(base * (3 + rng() * 5));
    case "delayed_breakout":
      return Math.round(base * (4 + rng() * 8));
    case "fade_after_start":
      return Math.round(base * (1.5 + rng() * 2));
    case "steady":
      return Math.round(base * (0.8 + rng() * 0.8));
    case "small_account_anomaly":
      // フォロワー規模に対して異常に伸びる（数十〜数百倍）
      return Math.round(Math.max(200_000, followers * (30 + rng() * 120)));
    case "underperformer":
      return Math.round(base * (0.1 + rng() * 0.3));
  }
}

export interface MockDataset {
  accounts: MockAccount[];
  posts: MockPost[];
}

export function generateMockDataset(
  opts: {
    seed?: number;
    accountCount?: number;
    postsPerAccount?: [number, number];
    now?: Date;
  } = {}
): MockDataset {
  const seed = opts.seed ?? 20260719;
  const accountCount = opts.accountCount ?? 36;
  const [minPosts, maxPosts] = opts.postsPerAccount ?? [8, 14];
  const now = opts.now ?? new Date();
  const rng = mulberry32(seed);

  const accounts: MockAccount[] = [];
  const posts: MockPost[] = [];

  for (let i = 0; i < accountCount; i++) {
    const bank = GENRE_BANKS[i % GENRE_BANKS.length];
    const group = pick(rng, bank.groups);
    // フォロワー分布: 小規模(1k-10k) 40% / 中規模(10k-100k) 40% / 大規模(100k-800k) 20%
    const sizeRoll = rng();
    const followersCount =
      sizeRoll < 0.4
        ? randInt(rng, 1_000, 10_000)
        : sizeRoll < 0.8
          ? randInt(rng, 10_000, 100_000)
          : randInt(rng, 100_000, 800_000);

    const username = `${bank.genreSlug}_${group.replace(/-/g, "_")}_${i}`;
    accounts.push({
      username,
      displayName: `${pick(rng, bank.themes).slice(0, 8)}の${["さき", "ゆう", "まい", "けん", "りな", "はな"][i % 6]}`,
      followersCount,
      categorySlug: bank.categorySlug,
      benchmarkGroupSlug: group,
      genreSlug: bank.genreSlug,
    });

    // 一部アカウントは意図的に投稿数を少なくする（カテゴリフォールバック検証用）
    const postCount =
      i % 11 === 10 ? randInt(rng, 2, 4) : randInt(rng, minPosts, maxPosts);

    for (let p = 0; p < postCount; p++) {
      const postRng = mulberry32(hashString(`${username}:${p}:${seed}`));
      const ageDays = 1 + postRng() * 44;
      const postedAt = new Date(now.getTime() - ageDays * 24 * 3600 * 1000);
      const curveType =
        followersCount < 15_000 && postRng() < 0.08
          ? "small_account_anomaly"
          : pickCurve(postRng);
      const finalViews = finalViewsFor(curveType, followersCount, postRng);
      const theme = pick(postRng, bank.themes);
      const hook = pick(postRng, bank.hooks);
      const shortcode = `MOCK${hashString(`${username}:${p}`).toString(36)}${p}`;

      posts.push({
        username,
        platformPostId: shortcode,
        instagramUrl: `https://www.instagram.com/reel/${shortcode}/`,
        postedAt,
        caption: `${hook} ${theme}のやり方を紹介します。保存して後で見返してね！`,
        hashtags: pickMany(postRng, bank.hashtags, randInt(postRng, 3, 5)),
        audioName: pick(postRng, AUDIO_NAMES),
        durationSeconds: randInt(postRng, 12, 90),
        curveType,
        finalViews,
        viewsAt: (hours: number) =>
          Math.round(finalViews * curveProgress(curveType, hours)),
        likesRate: 0.02 + postRng() * 0.06,
        commentsRate: 0.0005 + postRng() * 0.003,
      });
    }
  }

  return { accounts, posts };
}
