import { describe, expect, it } from "vitest";
import { checkCausalLanguage } from "@/server/ai/guardrails";

describe("checkCausalLanguage（因果断定表現ガードレール）", () => {
  it("因果断定表現を検出する", () => {
    expect(
      checkCausalLanguage("冒頭が長いことが原因で伸びなかったと考えられます").ok
    ).toBe(false);
    expect(checkCausalLanguage("フックが弱いせいで伸びなかった").ok).toBe(false);
    expect(checkCausalLanguage("敗因はCTAの欠如です。").ok).toBe(false);
  });

  it("相関ベースのヘッジ表現は許可する", () => {
    expect(
      checkCausalLanguage("伸びなかった投稿群との共通点が多い構成です").ok
    ).toBe(true);
    expect(
      checkCausalLanguage(
        "過去に伸び悩んだ投稿で多く見られた特徴です。相関はあるが、因果関係は断定できない点に注意してください。"
      ).ok
    ).toBe(true);
    expect(
      checkCausalLanguage("この要素を変更すると結果が変わる可能性があります").ok
    ).toBe(true);
  });

  it("違反箇所を violations に含める", () => {
    const result = checkCausalLanguage("動画尺が原因で伸びなかった");
    expect(result.violations.length).toBeGreaterThan(0);
  });
});
