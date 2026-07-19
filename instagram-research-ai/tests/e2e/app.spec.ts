import { expect, test, type Page } from "@playwright/test";

/**
 * E2Eハッピーパス。事前条件: モックデータがseed済み（npm run seed → job:scores → job:analyze）。
 */

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill("admin@example.com");
  await page.getByLabel("パスワード").fill("password123");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Instagram Research AI MVP", () => {
  test("未ログインはログイン画面へリダイレクトされる", async ({ page }) => {
    await page.goto("/posts");
    await expect(page).toHaveURL(/\/login/);
  });

  test("誤ったパスワードでログインできない", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill("admin@example.com");
    await page.getByLabel("パスワード").fill("wrongpassword");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(
      page.getByText("メールアドレスまたはパスワードが正しくありません")
    ).toBeVisible();
  });

  test("ログイン→ダッシュボードに集計と急上昇投稿が表示される", async ({ page }) => {
    await login(page);
    await expect(page.getByText("昨日追加された投稿")).toBeVisible();
    await expect(page.getByText("急上昇投稿（トレンドスコア順）")).toBeVisible();
  });

  test("投稿一覧: 表示・並び替え・絞り込みができる", async ({ page }) => {
    await login(page);
    await page.goto("/posts");
    await expect(page.getByRole("heading", { name: /投稿一覧/ })).toBeVisible();
    // モックデータの投稿行が表示される
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();

    // 「伸びた」で絞り込み
    await page.locator('select[name="class"]').selectOption("grew");
    await page.getByRole("button", { name: "絞り込む" }).click();
    await expect(page).toHaveURL(/class=grew/);
    await expect(rows.first()).toBeVisible();
    await expect(
      page.locator("tbody").getByText("伸びた").first()
    ).toBeVisible();
  });

  test("投稿詳細: 数値推移グラフ・スコア内訳・AI再分析", async ({ page }) => {
    await login(page);
    await page.goto("/posts?sortBy=trendScore");
    await page.locator("tbody tr").first().locator("a").first().click();
    await expect(page.getByText("数値推移")).toBeVisible();
    await expect(page.getByText("トレンドスコア内訳")).toBeVisible();
    // RechartsのSVGが描画される
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // AI分析の実行/再実行（スタブAI）
    const analyzeButton = page.getByRole("button", { name: /AI分析を(再)?実行/ });
    await analyzeButton.click();
    await expect(page.getByText("AIの分析理由")).toBeVisible({ timeout: 20_000 });
  });

  test("アカウント登録ができる", async ({ page }) => {
    await login(page);
    await page.goto("/accounts");
    const username = `e2e_account_${Date.now()}`;
    await page.getByPlaceholder("Instagramユーザー名").fill(username);
    await page.getByPlaceholder("フォロワー数").fill("12345");
    await page.getByRole("button", { name: "アカウント追加" }).click();
    await expect(page.getByText(`@${username} を登録しました`)).toBeVisible();
    await expect(
      page.getByRole("link", { name: `@${username}` })
    ).toBeVisible();
  });

  test("手動URL登録で投稿を追加できる", async ({ page }) => {
    await login(page);
    await page.goto("/posts");
    const shortcode = `E2E${Date.now().toString(36)}`;
    await page
      .getByPlaceholder("https://www.instagram.com/reel/...")
      .fill(`https://www.instagram.com/reel/${shortcode}/`);
    await page.getByRole("button", { name: "URL登録" }).click();
    await expect(page.getByText("登録しました")).toBeVisible({ timeout: 15_000 });
  });

  test("コレクション作成→詳細表示", async ({ page }) => {
    await login(page);
    await page.goto("/collections");
    const name = `E2Eコレクション${Date.now().toString(36)}`;
    await page.getByPlaceholder("新しいコレクション名").fill(name);
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("heading", { name }).click();
    await expect(
      page.getByRole("heading", { name: "投稿一覧" })
    ).toBeVisible();
  });

  test("AIチャット: DB検索に基づく回答と根拠投稿が表示される", async ({ page }) => {
    await login(page);
    await page.goto("/chat");
    await page
      .getByPlaceholder(/データベースへの質問を入力/)
      .fill("急上昇している投稿を教えて");
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByText("スタブ回答")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("根拠となった投稿:")).toBeVisible();
  });

  test("設定画面: スコア設定・トークン管理が表示される", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(
      page.getByText("トレンドスコア・分類基準（バージョン管理）")
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /シェア受け口/ })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "トークンを発行" })).toBeVisible();
  });
});
