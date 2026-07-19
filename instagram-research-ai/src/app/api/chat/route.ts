import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToChat, saveChatExchange } from "@/server/chat/respond";

const chatSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("member");
    const body = chatSchema.parse(await request.json());

    let sessionId = body.sessionId;
    if (sessionId) {
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId: user.id },
      });
      if (!session) {
        return NextResponse.json(
          { error: "チャットセッションが見つかりません" },
          { status: 404 }
        );
      }
    } else {
      const session = await prisma.chatSession.create({
        data: { userId: user.id, title: body.message.slice(0, 50) },
      });
      sessionId = session.id;
    }

    const historyRows = await prisma.chatMessage.findMany({
      where: { sessionId, role: { in: ["user", "assistant"] } },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    const history = historyRows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const result = await respondToChat(history, body.message);
    await saveChatExchange(sessionId, body.message, result);

    // 引用投稿のプレビュー情報を返す（UIでカード表示・詳細画面リンク化）
    const referencedPosts =
      result.referencedPostIds.length > 0
        ? await prisma.post.findMany({
            where: { id: { in: result.referencedPostIds.slice(0, 30) } },
            include: { account: true, latestMetric: true },
          })
        : [];

    return NextResponse.json({
      sessionId,
      text: result.text,
      queryConditions: result.queryConditions,
      referencedPosts: referencedPosts.map((p) => ({
        id: p.id,
        username: p.account.username,
        caption: p.caption?.slice(0, 80) ?? null,
        views: p.latestMetric?.views ?? null,
        trendScore: p.latestMetric?.trendScore ?? null,
        instagramUrl: p.instagramUrl,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole("member");
    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (sessionId) {
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId: user.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!session) {
        return NextResponse.json(
          { error: "セッションが見つかりません" },
          { status: 404 }
        );
      }
      return NextResponse.json({ session });
    }

    const sessions = await prisma.chatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}
