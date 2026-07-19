import {
  type InstagramProvider,
  type RawAccountData,
  type RawPostDetails,
  type RawPostMetrics,
  type RawPostRef,
} from "../types";
import { generateMockDataset, type MockDataset, type MockPost } from "./generator";

/**
 * Mockプロバイダー。seed.ts だけでなく実ジョブ経路（DATA_SOURCE=mock）でも使い、
 * JobRun パイプラインを本番同様に検証できるようにする。
 */
export class MockInstagramProvider implements InstagramProvider {
  readonly sourceType = "mock" as const;
  private dataset: MockDataset;

  constructor(seed?: number) {
    this.dataset = generateMockDataset({ seed });
  }

  private findPost(platformPostId: string): MockPost | undefined {
    return this.dataset.posts.find((p) => p.platformPostId === platformPostId);
  }

  async fetchAccount(input: { username: string }): Promise<RawAccountData> {
    const account = this.dataset.accounts.find(
      (a) => a.username === input.username
    );
    if (!account) {
      // 未知のアカウントでも決定的に生成する（シェア受け口経由の新規登録を模す）
      return {
        username: input.username,
        displayName: input.username,
        profileUrl: `https://www.instagram.com/${input.username}/`,
        followersCount: 5000,
      };
    }
    return {
      username: account.username,
      displayName: account.displayName,
      profileUrl: `https://www.instagram.com/${account.username}/`,
      followersCount: account.followersCount,
    };
  }

  async fetchRecentPosts(
    account: { username: string },
    opts?: { since?: Date; limit?: number }
  ): Promise<RawPostRef[]> {
    let posts = this.dataset.posts.filter(
      (p) => p.username === account.username
    );
    if (opts?.since) {
      posts = posts.filter((p) => p.postedAt >= (opts.since as Date));
    }
    posts.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
    if (opts?.limit) posts = posts.slice(0, opts.limit);
    return posts.map((p) => ({
      username: p.username,
      platformPostId: p.platformPostId,
      instagramUrl: p.instagramUrl,
    }));
  }

  async fetchPostDetails(ref: RawPostRef): Promise<RawPostDetails> {
    const post = this.findPost(ref.platformPostId);
    if (!post) throw new Error(`mock post not found: ${ref.platformPostId}`);
    return {
      username: post.username,
      platformPostId: post.platformPostId,
      instagramUrl: post.instagramUrl,
      postedAt: post.postedAt,
      caption: post.caption,
      hashtags: post.hashtags,
      audioName: post.audioName,
      durationSeconds: post.durationSeconds,
    };
  }

  async fetchPostMetrics(ref: RawPostRef): Promise<RawPostMetrics> {
    const post = this.findPost(ref.platformPostId);
    if (!post) throw new Error(`mock post not found: ${ref.platformPostId}`);
    const account = this.dataset.accounts.find(
      (a) => a.username === post.username
    );
    const now = new Date();
    const hours = (now.getTime() - post.postedAt.getTime()) / 3600_000;
    const views = post.viewsAt(hours);
    return {
      platformPostId: post.platformPostId,
      views,
      likes: Math.round(views * post.likesRate),
      comments: Math.round(views * post.commentsRate),
      followersCount: account?.followersCount,
      measuredAt: now,
    };
  }
}
