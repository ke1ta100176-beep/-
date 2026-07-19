import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  generateMockDataset,
  SNAPSHOT_HOURS,
} from "../src/server/providers/instagram/mock/generator";

const prisma = new PrismaClient();

/**
 * モックデータ投入。
 * - ユーザー3名（admin/member/viewer）
 * - カテゴリ・グループ・ジャンルプロファイル
 * - 36アカウント・約350投稿・各投稿に最大7時点の数値履歴（追記）
 * 決定的シードのため再実行で同じデータになる（既存データは削除して再投入）。
 */
async function main() {
  console.log("🌱 モックデータ投入を開始します...");

  // 依存の逆順で全消去（開発用DBの再seedを冪等にする）
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.collectionPost.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.report.deleteMany();
  await prisma.postScore.deleteMany();
  await prisma.aiAnalysis.deleteMany();
  await prisma.postLatestMetric.deleteMany();
  await prisma.postMetric.deleteMany();
  await prisma.post.deleteMany();
  await prisma.account.deleteMany();
  await prisma.benchmarkGroup.deleteMany();
  await prisma.category.deleteMany();
  await prisma.genreProfile.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.ingestToken.deleteMany();
  await prisma.user.deleteMany();

  // ユーザー
  const password = await bcrypt.hash("password123", 10);
  await prisma.user.createMany({
    data: [
      { email: "admin@example.com", name: "管理者", passwordHash: password, role: "admin" },
      { email: "member@example.com", name: "メンバー", passwordHash: password, role: "member" },
      { email: "viewer@example.com", name: "閲覧者", passwordHash: password, role: "viewer" },
    ],
  });
  console.log("✅ ユーザー3名（password: password123）");

  // カテゴリ
  const categoryDefs = [
    { slug: "recipe", name: "レシピ" },
    { slug: "fitness", name: "フィットネス" },
    { slug: "lifestyle", name: "暮らし" },
    { slug: "student", name: "生徒アカウント" },
    { slug: "other", name: "その他" },
  ];
  const categories = new Map<string, string>();
  for (const def of categoryDefs) {
    const row = await prisma.category.create({ data: def });
    categories.set(def.slug, row.id);
  }

  // ベンチマークグループ
  const groupDefs = [
    { slug: "tsuma-uke-recipe", name: "妻ウケレシピ" },
    { slug: "jitan-recipe", name: "時短レシピ" },
    { slug: "diet-recipe", name: "ダイエットレシピ" },
    { slug: "bread", name: "パン" },
    { slug: "sweets", name: "お菓子" },
    { slug: "koji", name: "麹" },
    { slug: "beginner-cooking", name: "料理初心者向け" },
    { slug: "fitness", name: "フィットネス" },
    { slug: "lifestyle", name: "暮らし・収納" },
    { slug: "student-accounts", name: "生徒アカウント" },
    { slug: "other", name: "その他" },
  ];
  const groups = new Map<string, string>();
  for (const def of groupDefs) {
    const row = await prisma.benchmarkGroup.create({ data: def });
    groups.set(def.slug, row.id);
  }
  console.log("✅ カテゴリ・グループ");

  // ジャンルプロファイル（全ジャンル対応の属性スキーマ）
  await prisma.genreProfile.createMany({
    data: [
      {
        name: "レシピ",
        slug: "recipe",
        attributeSchema: [
          { key: "ingredients", label: "食材", type: "string[]" },
          { key: "cooking_methods", label: "調理法", type: "string[]" },
          { key: "season", label: "季節", type: "string" },
        ],
        promptGuidance:
          "食材は主要なもののみ。調理法は「レンジ」「混ぜるだけ」「炒める」等の実際の工程。季節は投稿が想定する季節。",
      },
      {
        name: "フィットネス",
        slug: "fitness",
        attributeSchema: [
          { key: "body_parts", label: "部位", type: "string[]" },
          { key: "exercise_types", label: "運動種別", type: "string[]" },
          { key: "difficulty", label: "難易度", type: "string" },
        ],
        promptGuidance: "部位は「お腹」「脚」等。運動種別は「ストレッチ」「筋トレ」等。",
      },
      {
        name: "暮らし",
        slug: "lifestyle",
        attributeSchema: [
          { key: "items", label: "アイテム", type: "string[]" },
          { key: "locations", label: "場所", type: "string[]" },
        ],
        promptGuidance: "アイテムは使用商品・道具。場所はキッチン・洗面所等。",
      },
    ],
  });
  console.log("✅ ジャンルプロファイル3種");

  // アカウント + 投稿 + 数値履歴
  const now = new Date();
  const dataset = generateMockDataset({ seed: 20260719, now });

  let postCount = 0;
  let metricCount = 0;

  for (const mockAccount of dataset.accounts) {
    const account = await prisma.account.create({
      data: {
        username: mockAccount.username,
        displayName: mockAccount.displayName,
        profileUrl: `https://www.instagram.com/${mockAccount.username}/`,
        followersCount: mockAccount.followersCount,
        categoryId: categories.get(mockAccount.categorySlug) ?? null,
        benchmarkGroupId: groups.get(mockAccount.benchmarkGroupSlug) ?? null,
        isActive: true,
        sourceType: "mock",
        lastCheckedAt: now,
      },
    });

    const accountPosts = dataset.posts.filter(
      (p) => p.username === mockAccount.username
    );

    for (const mockPost of accountPosts) {
      const ageHours =
        (now.getTime() - mockPost.postedAt.getTime()) / 3600_000;

      const post = await prisma.post.create({
        data: {
          accountId: account.id,
          platformPostId: mockPost.platformPostId,
          instagramUrl: mockPost.instagramUrl,
          postedAt: mockPost.postedAt,
          caption: mockPost.caption,
          hashtags: mockPost.hashtags,
          audioName: mockPost.audioName,
          durationSeconds: mockPost.durationSeconds,
          sourceType: "mock",
          fetchStatus: "ok",
          firstFetchedAt: mockPost.postedAt,
          lastFetchedAt: now,
        },
      });
      postCount++;

      // 投稿年齢までのスナップショット時点（6h,12h,24h,48h,72h,7d,14d）を追記
      const snapshotHours = SNAPSHOT_HOURS.filter((h) => h <= ageHours);
      const points: number[] =
        snapshotHours.length > 0 ? [...snapshotHours] : [Math.max(1, ageHours)];

      let prevViews: number | null = null;
      let lastMetric: {
        views: number;
        likes: number;
        comments: number;
        measuredAt: Date;
        hoursSincePosted: number;
      } | null = null;

      for (const hours of points) {
        const views = mockPost.viewsAt(hours);
        const likes = Math.round(views * mockPost.likesRate);
        const comments = Math.round(views * mockPost.commentsRate);
        const measuredAt = new Date(
          mockPost.postedAt.getTime() + hours * 3600_000
        );
        await prisma.postMetric.create({
          data: {
            postId: post.id,
            views,
            likes,
            comments,
            followersCount: mockAccount.followersCount,
            hoursSincePosted: hours,
            measuredAt,
            sourceType: "mock",
            fetchStatus: "ok",
          },
        });
        metricCount++;
        lastMetric = {
          views,
          likes,
          comments,
          measuredAt,
          hoursSincePosted: hours,
        };
        if (points.indexOf(hours) < points.length - 1) prevViews = views;
      }

      if (lastMetric) {
        const hoursBetween =
          points.length >= 2
            ? points[points.length - 1] - points[points.length - 2]
            : lastMetric.hoursSincePosted;
        const delta =
          prevViews !== null ? lastMetric.views - prevViews : null;
        await prisma.postLatestMetric.create({
          data: {
            postId: post.id,
            views: lastMetric.views,
            likes: lastMetric.likes,
            comments: lastMetric.comments,
            followersCount: mockAccount.followersCount,
            viewsDelta: delta,
            viewsPerHour:
              delta !== null && hoursBetween > 0
                ? Math.max(0, delta) / hoursBetween
                : lastMetric.views / Math.max(1, lastMetric.hoursSincePosted),
            growthRate:
              delta !== null && prevViews && prevViews > 0
                ? delta / prevViews
                : null,
            followerRatio:
              lastMetric.views / Math.max(1, mockAccount.followersCount),
            measuredAt: lastMetric.measuredAt,
          },
        });
      }
    }
  }
  console.log(
    `✅ アカウント${dataset.accounts.length}件・投稿${postCount}件・数値履歴${metricCount}件`
  );

  // 初期コレクション
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@example.com" },
  });
  await prisma.collection.createMany({
    data: [
      { name: "夏レシピ", description: "夏企画の参考投稿", createdById: admin.id },
      { name: "競合調査", description: "ベンチマーク分析対象", createdById: admin.id },
      { name: "企画候補", description: "次の投稿企画のストック", createdById: admin.id },
    ],
  });
  console.log("✅ 初期コレクション3件");

  console.log(
    "🎉 完了。次のステップ: スコア計算ジョブとAI分析を実行してください（npm run job:scores / npm run job:analyze）"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
