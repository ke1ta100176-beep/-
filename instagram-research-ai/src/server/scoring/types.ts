export interface TrendScoreWeights {
  velocity: number;
  growth: number;
  followerRatio: number;
  accountBaseline: number;
  freshness: number;
}

export interface TrendScoreNorms {
  /** views/hour がこの値で velocity 成分が飽和する */
  velocityNorm: number;
  /** 前回取得比の増加率の上限（これ以上は1.0扱い） */
  growthCap: number;
  /** 再生数/フォロワー比がこの値で followerRatio 成分が飽和する */
  followerRatioNorm: number;
  /** アカウント基準値比の上限 */
  baselineDeltaCap: number;
  /** 投稿からこの時間で freshness が0になる */
  freshnessWindowHours: number;
}

export interface ClassificationThresholds {
  /** 中央値のこの倍以上で「伸びた」 */
  grewRatio: number;
  /** 中央値のこの倍未満で「伸び悩み」 */
  underperformRatio: number;
  /** この時間未満は too_early */
  minElapsedHours: number;
  /** アカウント基準値に必要な最低過去投稿数（未満はカテゴリへフォールバック） */
  minSampleSize: number;
  /** 基準値算出に使う直近投稿数 */
  trailingWindow: number;
  /** 窓内フォロワー変動がこの比率を超えたらフォロワー比で正規化 */
  followerDriftRatio: number;
  /** MADによる外れ値除外の係数 */
  madOutlierFactor: number;
}

export interface ScoringPolicy {
  version: number;
  weights: TrendScoreWeights & TrendScoreNorms;
  classificationThresholds: ClassificationThresholds;
}

export const DEFAULT_SCORING_POLICY: ScoringPolicy = {
  version: 1,
  weights: {
    velocity: 0.3,
    growth: 0.2,
    followerRatio: 0.2,
    accountBaseline: 0.2,
    freshness: 0.1,
    velocityNorm: 5000,
    growthCap: 3,
    followerRatioNorm: 20,
    baselineDeltaCap: 5,
    freshnessWindowHours: 168,
  },
  classificationThresholds: {
    grewRatio: 2.0,
    underperformRatio: 0.7,
    minElapsedHours: 24,
    minSampleSize: 6,
    trailingWindow: 20,
    followerDriftRatio: 0.2,
    madOutlierFactor: 5,
  },
};
