// app/api/notifications/route.ts — sf360-notifications (single-table schema)
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import {
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getUserInfo } from "@/lib/userPoints";

export const dynamic = "force-dynamic";

const TABLE = "sf360-notifications";

// Resolve the canonical actualUserId the same way other routes do
// (e.g. comments/[commentId]/route.ts), so notifications written under
// actualUserId can still be found even if the caller only has email/uid.
async function resolveActualUserId(uid?: string | null, email?: string | null) {
  const primaryId = uid || email;
  if (!primaryId) return null;
  try {
    const info = await getUserInfo(primaryId, undefined, email ?? undefined);
    if (info?.exists && info.actualUserId) return info.actualUserId as string;
  } catch (e) {
    console.warn("[notifications] getUserInfo resolution notice:", e);
  }
  return null;
}

// Mirrors lib/getUser.ts's NextAuth fallback exactly — when a session has no
// real Firebase UID, getUser.ts derives one by sanitizing the email this way.
// That sanitized value is what actually ends up as notifications' PK for
// those users, independent of whatever getUserInfo()/Firestore resolves to.
function sanitizeEmailFallback(email?: string | null) {
  if (!email) return null;
  return email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const uid = searchParams.get("uid");
    const countOnly = searchParams.get("countOnly") === "true";

    if (!email && !uid) {
      return NextResponse.json({ error: "email or uid is required" }, { status: 400 });
    }

    // Try every plausible PK value — uid, email, and the resolved
    // canonical actualUserId (what createNotification() actually keys on).
    const candidates: string[] = [];
    if (uid) candidates.push(uid);
    if (email) candidates.push(email);

    const actualUserId = await resolveActualUserId(uid, email);
    if (actualUserId && !candidates.includes(actualUserId)) {
      candidates.push(actualUserId);
    }

    const sanitizedFallback = sanitizeEmailFallback(email);
    if (sanitizedFallback && !candidates.includes(sanitizedFallback)) {
      candidates.push(sanitizedFallback);
    }

    let notifications: any[] = [];
    let unreadCount = 0;

    for (const identifier of candidates) {
      // ── Full list via PK, newest first ──
      try {
        const res = await docClient.send(
          new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: {
              ":pk": `USER#${identifier}`,
              ":prefix": "NOTIF#",
            },
            ScanIndexForward: false,
            Limit: 50,
          })
        );
        if (res.Items && res.Items.length > 0) {
          res.Items.forEach((item) => {
            notifications.push({
              id: (item.SK as string)?.split("#").pop() || item.id,
              ...item,
            });
          });
        }
      } catch (dynErr) {
        console.warn("[notifications GET] Query notice for", identifier, dynErr);
      }

      // ── Unread count via sparse GSI2Index ──
      try {
        const unreadRes = await docClient.send(
          new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI2Index",
            KeyConditionExpression: "GSI2PK = :g",
            ExpressionAttributeValues: { ":g": `USER#${identifier}#UNREAD` },
            Select: "COUNT",
          })
        );
        unreadCount += unreadRes.Count ?? 0;
      } catch (e) {
        console.warn("[notifications GET] GSI2Index unread notice for", identifier, e);
      }
    }

    // Dedupe in case multiple identifiers somehow returned overlapping items
    const seen = new Set<string>();
    notifications = notifications.filter((n) => {
      const key = n.SK ?? n.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    notifications.sort(
      (a, b) => new Date(b.sent_at ?? 0).getTime() - new Date(a.sent_at ?? 0).getTime()
    );

    if (countOnly) {
      return NextResponse.json(
        { success: true, unreadCount },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { success: true, notifications, unreadCount },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH — mark one or all notifications as read ─────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, email, sk, action } = body;

    // Resolve the canonical actualUserId as a fallback in case the caller
    // passed a raw uid/email instead of the actualUserId notifications are
    // actually keyed on.
    const resolvedUserId =
      userId ?? (await resolveActualUserId(undefined, email)) ?? userId;
    const sanitizedFallback = sanitizeEmailFallback(email);

    // Mark a single notification read — remove GSI2 keys (sparse index)
    if (action === "markRead" && sk) {
      const candidates = Array.from(
        new Set([userId, resolvedUserId, sanitizedFallback].filter(Boolean))
      );

      if (candidates.length === 0) {
        return NextResponse.json(
          { error: "userId (or email) is required for markRead" },
          { status: 400 }
        );
      }

      for (const uidCandidate of candidates) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE,
              Key: { PK: `USER#${uidCandidate}`, SK: sk },
              UpdateExpression: "SET #r = :true REMOVE GSI2PK, GSI2SK",
              ExpressionAttributeNames: { "#r": "read" },
              ExpressionAttributeValues: { ":true": true },
              ConditionExpression: "attribute_exists(PK)",
            })
          );
          // Succeeded against this candidate — stop trying others.
          break;
        } catch (e) {
          console.warn("[notifications PATCH] markRead notice for", uidCandidate, e);
        }
      }
      return NextResponse.json({ success: true });
    }

    // Mark all read — query unread via GSI2Index for every candidate, then batch-update
    if (action === "markAllRead") {
      const candidates = Array.from(
        new Set([userId, resolvedUserId, sanitizedFallback].filter(Boolean))
      );

      if (candidates.length === 0) {
        return NextResponse.json(
          { error: "userId (or email) is required for markAllRead" },
          { status: 400 }
        );
      }

      for (const uidCandidate of candidates) {
        try {
          const unreadRes = await docClient.send(
            new QueryCommand({
              TableName: TABLE,
              IndexName: "GSI2Index",
              KeyConditionExpression: "GSI2PK = :g",
              ExpressionAttributeValues: { ":g": `USER#${uidCandidate}#UNREAD` },
            })
          );

          const items = unreadRes.Items ?? [];
          await Promise.all(
            items.map((item) =>
              docClient.send(
                new UpdateCommand({
                  TableName: TABLE,
                  Key: { PK: item.PK, SK: item.SK },
                  UpdateExpression: "SET #r = :true REMOVE GSI2PK, GSI2SK",
                  ExpressionAttributeNames: { "#r": "read" },
                  ExpressionAttributeValues: { ":true": true },
                })
              )
            )
          );
        } catch (e) {
          console.warn("[notifications PATCH] markAllRead notice for", uidCandidate, e);
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      {
        error:
          "Invalid action or missing fields (need userId/email + sk for markRead, userId/email for markAllRead)",
      },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE — clear one notification or all for a user ─────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, email, sk, all } = body;

    const resolvedUserId =
      userId ?? (await resolveActualUserId(undefined, email)) ?? userId;
    const sanitizedFallback = sanitizeEmailFallback(email);
    const candidates = Array.from(
      new Set([userId, resolvedUserId, sanitizedFallback].filter(Boolean))
    );

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "userId (or email) is required" },
        { status: 400 }
      );
    }

    if (sk && !all) {
      for (const uidCandidate of candidates) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLE,
              Key: { PK: `USER#${uidCandidate}`, SK: sk },
            })
          );
        } catch (e) {
          console.warn("[notifications DELETE] single delete notice for", uidCandidate, e);
        }
      }
      return NextResponse.json({ success: true });
    }

    if (all) {
      for (const uidCandidate of candidates) {
        try {
          const res = await docClient.send(
            new QueryCommand({
              TableName: TABLE,
              KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
              ExpressionAttributeValues: {
                ":pk": `USER#${uidCandidate}`,
                ":prefix": "NOTIF#",
              },
            })
          );

          const items = res.Items ?? [];
          // BatchWrite in chunks of 25 (DynamoDB limit)
          for (let i = 0; i < items.length; i += 25) {
            const chunk = items.slice(i, i + 25);
            await docClient.send(
              new BatchWriteCommand({
                RequestItems: {
                  [TABLE]: chunk.map((item) => ({
                    DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
                  })),
                },
              })
            );
          }
        } catch (e) {
          console.warn("[notifications DELETE] bulk delete notice for", uidCandidate, e);
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Provide sk for single delete, or all:true for bulk delete" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}