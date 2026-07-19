/**
 * AI出力の表現ガードレール。
 * 「この要素が原因で伸びなかった」等の因果断定表現を検出し、再生成を促す。
 * プロンプト指示だけに頼らず後段でも機械的に検証する二層防御。
 */

const FORBIDDEN_CAUSAL_PATTERNS: RegExp[] = [
  /が原因で(伸びな|バズらな|再生されな)/,
  /(せい|所為)で(伸びな|失敗)/,
  /だから(伸びなかった|失敗した)/,
  /(原因|敗因)は[^。]{0,30}(です|だ|である)。?/,
  /間違いなく[^。]{0,20}(原因|理由)/,
  /確実に[^。]{0,20}(伸び|バズ)/,
];

export interface GuardrailResult {
  ok: boolean;
  violations: string[];
}

export function checkCausalLanguage(text: string): GuardrailResult {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_CAUSAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) violations.push(match[0]);
  }
  return { ok: violations.length === 0, violations };
}

/** 分析系プロンプトへ常時挿入するヘッジ表現の指示文 */
export const HEDGING_INSTRUCTION = `
重要な表現ルール:
- 因果関係を断定しない。「〜が原因で伸びなかった」「〜のせいで失敗した」等は禁止。
- 次のような相関ベースの表現を使う:
  - 「伸びなかった投稿群との共通点が多い」
  - 「過去に伸び悩んだ投稿で多く見られた特徴」
  - 「改善候補として検討できる」
  - 「この要素を変更すると結果が変わる可能性がある」
  - 「相関はあるが、因果関係は断定できない」
- データ件数が少ない場合は必ずその旨を明記する。
`.trim();
