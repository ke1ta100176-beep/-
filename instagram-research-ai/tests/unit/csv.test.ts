import { describe, expect, it } from "vitest";
import { parseCsvImport } from "@/server/providers/instagram/csv";
import { parseInstagramUrl } from "@/server/providers/instagram/types";

describe("parseInstagramUrl", () => {
  it("リール・投稿・TVのURLからshortcodeを抽出する", () => {
    expect(
      parseInstagramUrl("https://www.instagram.com/reel/ABC123xyz/")
    ).toEqual({
      platformPostId: "ABC123xyz",
      canonicalUrl: "https://www.instagram.com/reel/ABC123xyz/",
    });
    expect(
      parseInstagramUrl("https://instagram.com/p/XYZ_-789?utm_source=share")
        ?.platformPostId
    ).toBe("XYZ_-789");
  });

  it("Instagram以外のURLはnullを返す", () => {
    expect(parseInstagramUrl("https://example.com/reel/ABC/")).toBeNull();
    expect(parseInstagramUrl("https://evil.com/instagram.com/reel/A/")).toBeNull();
    expect(parseInstagramUrl("not a url")).toBeNull();
    expect(
      parseInstagramUrl("http://www.instagram.com/reel/ABC/") // httpは不可
    ).toBeNull();
  });

  it("プロフィールURLは投稿として扱わない", () => {
    expect(parseInstagramUrl("https://www.instagram.com/someuser/")).toBeNull();
  });
});

describe("parseCsvImport", () => {
  const header =
    "username,instagram_url,posted_at,caption,hashtags,duration_seconds,followers_count,views,likes,comments,measured_at";

  it("正常な行を正規化する", () => {
    const csv = [
      header,
      `cookmama,https://www.instagram.com/reel/AAA111/,2026-07-01T10:00:00Z,そうめんアレンジ,#簡単レシピ #夏,30,12000,50000,1500,80,2026-07-03T10:00:00Z`,
    ].join("\n");
    const { posts, errors } = parseCsvImport(csv);
    expect(errors).toHaveLength(0);
    expect(posts).toHaveLength(1);
    expect(posts[0].account.username).toBe("cookmama");
    expect(posts[0].details.platformPostId).toBe("AAA111");
    expect(posts[0].details.hashtags).toEqual(["#簡単レシピ", "#夏"]);
    expect(posts[0].metrics?.views).toBe(50000);
    expect(posts[0].metrics?.saves).toBeUndefined(); // 未提供カラムはnullable
  });

  it("不正な行はエラーとして報告し、他の行は取り込む", () => {
    const csv = [
      header,
      `gooduser,https://www.instagram.com/reel/BBB222/,,テスト,,,,1000,,,`,
      `baduser,https://example.com/notinsta,,,,,,,,,`,
      `,https://www.instagram.com/reel/CCC333/,,,,,,,,,`, // username欠落
    ].join("\n");
    const { posts, errors } = parseCsvImport(csv);
    expect(posts).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0].row).toBe(3);
  });

  it("数値カラムに文字列が入っている行を拒否する", () => {
    const csv = [
      header,
      `user1,https://www.instagram.com/reel/DDD444/,,,,abc,,,,,`,
    ].join("\n");
    const { posts, errors } = parseCsvImport(csv);
    expect(posts).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});
