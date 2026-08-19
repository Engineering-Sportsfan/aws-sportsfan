// app/api/ask-ai/sessions/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string; username: string } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;

  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;

  const data = snap.data() as { username?: string };
  return { id: info.actualUserId, username: data?.username ?? "Fan" };
}

// GET: list every Ask AI session for this user, most-recently-updated first.
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    let sessions: any[] = [];

    // 1. Query DynamoDB RealTimeChat
    try {
      const qSessions = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :rId AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":rId": `ASKAI#${resolved.id}`,
            ":skPrefix": "SESSION#",
          },
          ScanIndexForward: false,
          Limit: 50,
        })
      );

      if (qSessions.Items && qSessions.Items.length > 0) {
        sessions = await Promise.all(
          qSessions.Items.map(async (item) => {
            const sessionId = item.sessionId || item.sk.replace(/^SESSION#/, "");

            // Fetch first and last message for preview
            const qMsgs = await docClient.send(
              new QueryCommand({
                TableName: "RealTimeChat",
                KeyConditionExpression: "roomId = :rId AND begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":rId": `ASKAI#${resolved.id}#${sessionId}`,
                  ":skPrefix": "MSG#",
                },
                ScanIndexForward: true,
                Limit: 50,
              })
            );

            const msgItems = (qMsgs.Items as any[]) || [];
            const userMsgs = msgItems.filter((m) => m.role === "user");
            const firstQuestion = userMsgs[0]?.content as string | undefined;
            const lastMessage = msgItems[msgItems.length - 1]?.content as string | undefined;
            const updatedAtMs = item.updatedAt || Date.now();
            const customTitle = item.customTitle as string | undefined;

            return {
              sessionId,
              title: customTitle || firstQuestion?.slice(0, 60) || "New chat",
              subtitle: lastMessage?.slice(0, 80) || "",
              dateLabel: new Date(updatedAtMs).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              }),
            };
          })
        );
      }
    } catch (e) {
      console.warn("[ask-ai GET sessions] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (sessions.length === 0 && db) {
      const sessionsSnap = await db
        .collection("askaiConversations")
        .doc(resolved.id)
        .collection("sessions")
        .orderBy("updatedAt", "desc")
        .limit(50)
        .get();

      if (!sessionsSnap.empty) {
        sessions = await Promise.all(
          sessionsSnap.docs.map(async (doc) => {
            const data = doc.data();
            const msgCol = doc.ref.collection("messages");

            const [firstSnap, lastSnap] = await Promise.all([
              msgCol.where("role", "==", "user").orderBy("timestamp", "asc").limit(1).get(),
              msgCol.orderBy("timestamp", "desc").limit(1).get(),
            ]);

            const firstQuestion = firstSnap.docs[0]?.data()?.content as string | undefined;
            const lastMessage = lastSnap.docs[0]?.data()?.content as string | undefined;
            const updatedAtMs = data.updatedAt?.toMillis?.() ?? Date.now();
            const customTitle = data.customTitle as string | undefined;

            return {
              sessionId: doc.id,
              title: customTitle || firstQuestion?.slice(0, 60) || "New chat",
              subtitle: lastMessage?.slice(0, 80) || "",
              dateLabel: new Date(updatedAtMs).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              }),
            };
          })
        );
      }
    }

    return NextResponse.json({ success: true, sessions });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[ask-ai GET sessions] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}