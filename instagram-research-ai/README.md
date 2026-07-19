# Instagram Research AI

競合リサーチを支援する「Instagram専属リサーチAI」。単なる分析画面ではなく、**数値の変化と投稿内容を蓄積し、次の企画判断に変換する**ための社内リサーチOSです。

- 昨日バズった投稿ではなく、**今まさに伸び始めている投稿**を発見する
- 投稿後の数値推移を**時系列で蓄積**（現在値の上書きは設計上禁止）
- 伸びた投稿・伸び悩んだ投稿の**共通点を相関ベースで抽出**（因果は断定しない）
- データベース全体に**AIチャットで質問**（回答は必ずDB検索の根拠付き）

## 主な機能（MVP実装済み）

| 機能 | 概要 |
|---|---|
| アカウント管理 | ベンチマークアカウントの登録・カテゴリ/グループ分類（マスタは画面から追加可能） |
| 投稿登録 | 手動URL登録 / CSVインポート / **シェア受け口**（iOSショートカット・Android PWA共有） |
| 数値履歴 | 投稿ごとに複数時点のスナップショットを**追記専用**で保存（6h/12h/24h/48h/72h/7d/14d想定） |
| トレンドスコア | 増加速度×フォロワー倍率×鮮度×アカウント平均比の加重和（0〜100、DBでバージョン管理） |
| 成功/伸び悩み分類 | 同一アカウント直近投稿の中央値比（MAD外れ値除外・カテゴリフォールバック・too_earlyゲート付き） |
| 投稿一覧/詳細 | 全条件のソート・絞り込み、数値推移グラフ、スコア内訳、類似投稿 |
| AIタグ付け | テーマ・フック・CTA・ペルソナ等を構造化JSON+Zod検証で保存。**ジャンル非依存**（GenreProfileで属性拡張） |
| コレクション | 投稿のフォルダ整理と集計（伸びた群/伸び悩んだ群の共通点比較） |
| AIチャット | tool-use方式でDBを検索し、対象件数・期間・条件・根拠投稿リンク付きで回答。データ不足は明示 |
| 日次レポート | アプリ内生成・保存（外部通知は未実装） |
| ジョブ基盤 | 取得/スコア/分析/レポートの各ジョブをJobRunに記録（件数・エラー・コスト概算） |

## 技術構成

- **フロントエンド/バックエンド**: Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS 4
- **DB**: PostgreSQL + Prisma 6（本番はSupabase Postgres想定）
- **認証**: Auth.js v5（credentials方式・ロール: admin/member/viewer）
- **AI**: Anthropic Claude API（tool-use構造化出力）。APIキー未設定時は**決定的スタブAI**で全機能が動作
- **グラフ**: Recharts / **検証**: Zod / **テスト**: Vitest + Playwright

### 設計上の重要な原則

1. **数値履歴は追記専用**: `post_metrics` へのUPDATE経路は存在しない。書き込みは `src/server/services/metrics.ts` の `appendMetricSnapshot` のみ。`post_latest_metrics` は一覧表示用の再構築可能なキャッシュ。
2. **データ取得はProvider抽象化**: `src/server/providers/instagram/` 配下で Mock / CSV を実装。実スクレイピングは未実装（下記の法的注意参照）。
3. **AI分析は履歴保持**: 再分析は新規行を追加し `isLatest` をフリップ。プロンプトはバージョン別ファイルで凍結。
4. **スコア設定はDBでバージョン管理**: 重み・しきい値の変更は新バージョン行を作成し、過去スコアの再現性を保つ。
5. **AIは因果を断定しない**: プロンプト指示＋出力の正規表現ガードレールの二層で「〜が原因で伸びなかった」等を排除。

## セットアップ

### 1. 依存関係

```bash
cd instagram-research-ai
npm install
```

### 2. 環境変数

```bash
cp .env.example .env
# DATABASE_URL / AUTH_SECRET / CRON_SECRET を設定
# ANTHROPIC_API_KEY は任意（未設定ならスタブAIで動作）
```

### 3. DB初期化とモックデータ投入

```bash
# ローカルPostgreSQLまたはSupabaseのDATABASE_URLに対して
npx prisma migrate dev        # スキーマ適用
npm run seed                  # モックデータ投入（36アカウント・約370投稿・14日分履歴）
npm run job:scores            # トレンドスコア計算（373投稿の場合2回実行）
npm run job:scores
AI_PROVIDER=stub npm run job:analyze   # AIタグ付け（スタブ、15件/回）
```

シードユーザー: `admin@example.com` / `member@example.com` / `viewer@example.com`（パスワードはすべて `password123`）

### 4. 開発サーバー起動

```bash
npm run dev
# http://localhost:3000
```

## テスト

```bash
npm run typecheck      # 型チェック
npm run lint           # ESLint
npm run test           # unit + integration（要: テスト用DB instagram_research_test）
npm run test:e2e       # Playwright E2E（要: seed済みDB + ビルド）
```

テスト用DBの準備:

```bash
createdb -U postgres instagram_research_test
DATABASE_URL=postgresql://postgres@localhost:5432/instagram_research_test npx prisma db push
```

## 定期ジョブの実行方法

ジョブは `POST /api/internal/jobs/<job>`（`Authorization: Bearer $CRON_SECRET`）で起動します。

- `fetch-posts` — アカウント巡回（lastCheckedAt古い順に20件/回の有界バッチ）
- `compute-scores` — スコア再計算（未スコア優先、300件/回）
- `analyze-posts` — AIタグ付け（未分析優先、15件/回）
- `generate-report` — 日次レポート生成

スケジューラは以下のいずれかを推奨:

1. **Supabase pg_cron + pg_net**: DBから直接HTTPで叩く（追加インフラ不要）
2. **Vercel Cron**: `vercel.json` にスケジュール定義
3. 外部cronサービス（cron-job.org等）

サーバーレスの実行時間制限があるため、各ジョブは有界バッチで処理し、15〜30分間隔の複数回実行で全体を循環させる設計です。CLI実行（`npm run job:*`）も可能です。

## シェア受け口の設定（Instagramから共有して保存）

1. 設定画面 →「トークンを発行」で個人用トークンを取得（表示は一度だけ・DBにはハッシュのみ保存）
2. **iPhone**: ショートカットアプリで新規ショートカット作成 →「共有シートに表示」をON → 受け取り型を「URL」→「URLの内容を取得」アクションで `https://<ホスト>/api/ingest?token=<トークン>` へ POST、本文に「ショートカットの入力」
3. **Android**: サイトをホーム画面に追加（PWA）すると共有メニューに表示 → 共有すると `/share` ページ経由で登録
4. Instagramアプリの共有ボタン → 作成したショートカット/アプリを選択 → 自動で登録・AI分類

## データ取得Providerの追加方法

1. `src/server/providers/instagram/<name>/index.ts` に `InstagramProvider` インターフェースを実装
2. `src/server/providers/instagram/index.ts` の `getInstagramProvider()` に分岐を追加
3. `.env` の `DATA_SOURCE=<name>` で切り替え

ビジネスロジック・スキーマの変更は不要です。

## AIモデルの変更方法

- `.env` の `AI_MODEL` を変更（例: `claude-opus-4-8`）
- プロバイダー自体の切り替えは `AI_PROVIDER`（`anthropic` / `stub`）。OpenAI等を追加する場合は `src/server/ai/` に `AIProvider` インターフェースを実装し `getAIProvider()` に分岐を追加
- コスト概算の単価表は `src/server/ai/types.ts` の `MODEL_COSTS`

## 法的な注意事項（必読）

このツールは**社内少人数の内部リサーチ専用**であり、以下を前提に設計されています。

- **MVPは自動スクレイピングを実装していません**。データ入力は人間の操作起点（シェア/手動URL/CSV）のみです。
- Instagramの利用規約は自動収集を禁じています。将来外部取得サービス（Apify等）を利用する場合、規約違反（民事リスク・アカウント停止）の可能性を理解した上で判断してください。**ログイン済みセッションを使った自動取得は実装しない方針です。**
- 公開投稿の情報解析目的での保存は日本の著作権法30条の4の範囲と解釈しうるものの、**取得データの外部公開・再配布は行わないでください**。
- 蓄積したアカウント情報は個人情報保護法上のデータベースになりえます。目的外利用・第三者提供をしないでください。講座生のデータは本人同意を前提としてください。
- 確定的な適法性の判断が必要な場合は弁護士に相談してください。

## 現在の制限

- 実データ取得は未実装（Mock/CSV/シェアURL登録のみ）。シェア登録時のメタデータ・数値は取得Provider実装後に自動補完される設計
- 動画本体の解析（カット数・テロップ量等）は未実装（手動入力フィールドで代替可能）
- レポートの外部通知（Slack/メール）は未実装（アプリ内生成・保存のみ）
- 類似投稿検索はタグ一致方式（pgvector埋め込みは将来対応）
- `/api/ingest` のレートリミットはインスタンスローカル（サーバーレス多インスタンス時は完全ではない）
- ログイン試行のレートリミットなし（少人数内部ツール前提。公開環境に置く場合は要追加）

## 今後の開発候補

1. **URL診断機能**: 講座生の投稿URLを蓄積データと比較し改善候補を提示（第2段階）
2. **ダイヤモンド発見**: 投稿数・フォロワー・期間・倍率の条件を組み合わせた新興アカウント検索
3. **毎朝レポートの外部通知**: Slack / Discord / メール
4. **pgvector類似検索**: キャプション・AI要約の埋め込みによる類似投稿検索（チャットのツールとして追加）
5. **実データProvider**: 外部取得サービス連携（Providerパターンで追加）
6. **動画解析**: 冒頭構成・テロップ量などの自動抽出
