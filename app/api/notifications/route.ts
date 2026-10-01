// app/api/notifications/route.ts — sf360-notifications (single-table schema with multi-environment candidate fallback)
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { getCandidateTableNames } from "@/lib/dualWrite";
import { db } from "@/lib/firebaseAdmin";
import {
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getUserInfo } from "@/lib/userPoints";

export const dynamic = "force-dynamic";

// Resolve the canonical actualUserId the same way other routes do
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

// Mirrors lib/getUser.ts's NextAuth fallback exactly
function sanitizeEmailFallback(email?: string | null) {
  if (!email) return null;
  return email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
}

function cleanId(id?: string | null): string {
  if (!id) return "";
  return id.replace(/^USER#/, "").trim();
}

function extractCanonicalNotifId(rawId?: string | null, rawSk?: string | null): string {
  let id = "";
  if (rawSk && typeof rawSk === "string" && rawSk.startsWith("NOTIF#")) {
    id = rawSk.split("#").pop() || "";
  }
  if (!id && rawId && typeof rawId === "string") {
    id = rawId;
  }
  if (!id) return "";

  // Strip user / candidate suffixes from dual-write Firestore doc IDs (e.g. ntf_xxx_u_fan123 or ntf_xxx_user@example.com)
  return id
    .replace(/_[^_@]+@[^.]+.*$/, "")
    .replace(/_u_[^_]+$/, "")
    .replace(/_anon_[^_]+$/, "")
    .trim();
}

function getCanonicalDedupeKey(item: any): string {
  if (!item) return "";
  const baseId = extractCanonicalNotifId(item.id || item.notification_id, item.SK || item.sk);
  if (baseId && (baseId.startsWith("ntf_") || baseId.length > 8)) {
    return `ID#${baseId}`;
  }
  if (item.aggregation_key) {
    return `AGGR#${item.aggregation_key}`;
  }
  if (baseId) {
    return `ID#${baseId}`;
  }
  const type = item.notification_type || item.type || "unknown";
  const entity = item.entity_id || item.entityId || item.title || "";
  const body = item.body || item.message || "";
  return `SIG#${type}###${entity}###${body}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const uid = searchParams.get("uid");
    const actualUserIdParam = searchParams.get("actualUserId") || searchParams.get("userId");
    const countOnly = searchParams.get("countOnly") === "true";

    if (!email && !uid && !actualUserIdParam) {
      return NextResponse.json({ error: "email, uid, or actualUserId is required" }, { status: 400 });
    }

    // Build comprehensive candidates list
    const candidateSet = new Set<string>();

    if (uid) {
      const cUid = cleanId(uid);
      if (cUid) {
        candidateSet.add(cUid);
        candidateSet.add(cUid.toLowerCase());
      }
    }

    if (email) {
      const cEmail = cleanId(email);
      if (cEmail) {
        candidateSet.add(cEmail);
        candidateSet.add(cEmail.toLowerCase());
        candidateSet.add(cEmail.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_"));
        candidateSet.add(cEmail.toLowerCase().replace(/[@.]/g, "_"));
      }
    }

    if (actualUserIdParam) {
      const cAct = cleanId(actualUserIdParam);
      if (cAct) {
        candidateSet.add(cAct);
        candidateSet.add(cAct.toLowerCase());
      }
    }

    const resolvedActualUserId = await resolveActualUserId(uid, email);
    if (resolvedActualUserId) {
      const cRes = cleanId(resolvedActualUserId);
      if (cRes) {
        candidateSet.add(cRes);
        candidateSet.add(cRes.toLowerCase());
      }
    }

    const sanitizedFallback = sanitizeEmailFallback(email);
    if (sanitizedFallback) {
      candidateSet.add(sanitizedFallback);
    }

    // Global / system notification keys
    candidateSet.add("all_users");
    candidateSet.add("all");
    candidateSet.add("system");

    const candidates = Array.from(candidateSet).filter(Boolean);
    const candidateTables = getCandidateTableNames(TABLES.Notifications);

    let notifications: any[] = [];
    let unreadCount = 0;
    const seenNotifKeys = new Set<string>();

    // 1. Query across candidate DynamoDB tables
    for (const table of candidateTables) {
      for (const identifier of candidates) {
        try {
          const res = await docClient.send(
            new QueryCommand({
              TableName: table,
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
            for (const item of res.Items) {
              const canonicalId = extractCanonicalNotifId(item.id || item.notification_id, item.SK);
              const dedupeKey = getCanonicalDedupeKey(item);
              if (!seenNotifKeys.has(dedupeKey)) {
                seenNotifKeys.add(dedupeKey);
                notifications.push({
                  ...item,
                  id: canonicalId || item.id || (item.SK as string)?.split("#").pop(),
                });
              }
            }
          }
        } catch (dynErr: any) {
          const isTableMissing =
            dynErr?.name === "ResourceNotFoundException" ||
            dynErr?.message?.includes("Cannot do operations on a non-existent table");
          if (!isTableMissing) {
            console.warn(`[notifications GET] Query notice for table ${table}, id ${identifier}:`, dynErr?.message || dynErr);
          }
        }

        // Unread count via sparse GSI2Index
        try {
          const unreadRes = await docClient.send(
            new QueryCommand({
              TableName: table,
              IndexName: "GSI2Index",
              KeyConditionExpression: "GSI2PK = :g",
              ExpressionAttributeValues: { ":g": `USER#${identifier}#UNREAD` },
              Select: "COUNT",
            })
          );
          unreadCount += unreadRes.Count ?? 0;
        } catch {}
      }
    }

    // 2. Query Firestore notifications collection as fallback/supplement
    if (db) {
      try {
        const firestoreCandidates = candidates.filter(
          (c) => c !== "all_users" && c !== "all" && c !== "system"
        );
        for (const candidateId of firestoreCandidates) {
          const [emailSnap, uidSnap] = await Promise.all([
            db.collection(getFirestoreCollection("notifications")).where("recipientEmail", "==", candidateId).limit(20).get().catch(() => null),
            db.collection(getFirestoreCollection("notifications")).where("recipientUid", "==", candidateId).limit(20).get().catch(() => null),
          ]);

          for (const snap of [emailSnap, uidSnap]) {
            if (!snap || snap.empty) continue;
            for (const doc of snap.docs) {
              const data = doc.data();
              const rawId = data.id || doc.id;
              const canonicalId = extractCanonicalNotifId(rawId, null);
              const dedupeKey = getCanonicalDedupeKey({ ...data, id: rawId });
              if (!seenNotifKeys.has(dedupeKey)) {
                seenNotifKeys.add(dedupeKey);
                notifications.push({
                  id: canonicalId || rawId,
                  PK: `USER#${candidateId}`,
                  SK: `NOTIF#${new Date(data.createdAt || data.sent_at || 0).toISOString()}#${canonicalId || rawId}`,
                  ...data,
                });
              }
            }
          }
        }
      } catch (fsErr) {
        console.warn("[notifications GET] Firestore fallback check notice:", fsErr);
      }
    }

    // Final deduplication pass across aggregation key and canonical ID
    const finalDedupeMap = new Map<string, any>();
    for (const n of notifications) {
      const key = getCanonicalDedupeKey(n);
      if (!finalDedupeMap.has(key)) {
        finalDedupeMap.set(key, n);
      } else {
        const existing = finalDedupeMap.get(key);
        const isExistingRead = Boolean(existing.read || existing.isRead);
        const isCurrentRead = Boolean(n.read || n.isRead);
        const mergedRead = isExistingRead || isCurrentRead;
        finalDedupeMap.set(key, { ...existing, ...n, read: mergedRead, isRead: mergedRead });
      }
    }

    notifications = Array.from(finalDedupeMap.values());

    notifications.sort(
      (a, b) =>
        new Date(b.sent_at || b.createdAt || 0).getTime() -
        new Date(a.sent_at || a.createdAt || 0).getTime()
    );

    const calculatedUnread = notifications.filter((n) => !(n.read || n.isRead)).length;
    const finalUnreadCount = Math.max(unreadCount, calculatedUnread);

    if (countOnly) {
      return NextResponse.json(
        { success: true, unreadCount: finalUnreadCount },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { success: true, notifications, unreadCount: finalUnreadCount },
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
    const { userId, email, sk, action, pk, id } = body;

    const resolvedUserId =
      userId ?? (await resolveActualUserId(undefined, email)) ?? userId;
    const sanitizedFallback = sanitizeEmailFallback(email);
    const candidateSet = new Set<string>();

    if (pk) candidateSet.add(cleanId(pk));
    if (userId) candidateSet.add(cleanId(userId));
    if (email) candidateSet.add(cleanId(email));
    if (resolvedUserId) candidateSet.add(cleanId(resolvedUserId));
    if (sanitizedFallback) candidateSet.add(sanitizedFallback);

    const candidates = Array.from(candidateSet).filter(Boolean);
    const candidateTables = getCandidateTableNames(TABLES.Notifications);

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "userId or email is required" },
        { status: 400 }
      );
    }

    // Mark single notification read
    if (action === "markRead") {
      const targetPkList = [
        ...(pk ? [pk.startsWith("USER#") ? pk : `USER#${cleanId(pk)}`] : []),
        ...candidates.map((c) => `USER#${c}`),
      ];

      for (const table of candidateTables) {
        for (const fullPk of targetPkList) {
          if (sk) {
            try {
              await docClient.send(
                new UpdateCommand({
                  TableName: table,
                  Key: { PK: fullPk, SK: sk },
                  UpdateExpression: "SET #r = :true, isRead = :true, readAt = :now REMOVE GSI2PK, GSI2SK",
                  ExpressionAttributeNames: { "#r": "read" },
                  ExpressionAttributeValues: { ":true": true, ":now": Date.now() },
                })
              );
            } catch {}
          }
        }
      }

      // Also sync to Firestore
      if (db && (id || sk)) {
        try {
          const docId = id || (sk ? sk.split("#").pop() : null);
          if (docId) {
            for (const cand of candidates) {
              await db.collection(getFirestoreCollection("notifications")).doc(`${docId}_${cand}`).set({
                read: true,
                isRead: true,
                readAt: Date.now(),
              }, { merge: true }).catch(() => {});
            }
          }
        } catch {}
      }

      return NextResponse.json({ success: true });
    }

    // Mark all read
    if (action === "markAllRead") {
      for (const table of candidateTables) {
        for (const uidCandidate of candidates) {
          // 1. Primary key query to mark all notifications read
          try {
            const queryRes = await docClient.send(
              new QueryCommand({
                TableName: table,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
                ExpressionAttributeValues: {
                  ":pk": `USER#${uidCandidate}`,
                  ":prefix": "NOTIF#",
                },
              })
            );
            if (queryRes.Items && queryRes.Items.length > 0) {
              await Promise.all(
                queryRes.Items.map((item) =>
                  docClient.send(
                    new UpdateCommand({
                      TableName: table,
                      Key: { PK: item.PK, SK: item.SK },
                      UpdateExpression: "SET #r = :true, isRead = :true, readAt = :now REMOVE GSI2PK, GSI2SK",
                      ExpressionAttributeNames: { "#r": "read" },
                      ExpressionAttributeValues: { ":true": true, ":now": Date.now() },
                    })
                  ).catch(() => {})
                )
              );
            }
          } catch {}

          // 2. GSI2 query for unread records
          try {
            const unreadRes = await docClient.send(
              new QueryCommand({
                TableName: table,
                IndexName: "GSI2Index",
                KeyConditionExpression: "GSI2PK = :g",
                ExpressionAttributeValues: { ":g": `USER#${uidCandidate}#UNREAD` },
              })
            );

            const items = unreadRes.Items ?? [];
            if (items.length > 0) {
              await Promise.all(
                items.map((item) =>
                  docClient.send(
                    new UpdateCommand({
                      TableName: table,
                      Key: { PK: item.PK, SK: item.SK },
                      UpdateExpression: "SET #r = :true, isRead = :true, readAt = :now REMOVE GSI2PK, GSI2SK",
                      ExpressionAttributeNames: { "#r": "read" },
                      ExpressionAttributeValues: { ":true": true, ":now": Date.now() },
                    })
                  ).catch(() => {})
                )
              );
            }
          } catch {}
        }
      }

      // Sync mark all read to Firestore
      if (db) {
        for (const cand of candidates) {
          try {
            const snaps = await Promise.all([
              db.collection(getFirestoreCollection("notifications")).where("recipientEmail", "==", cand).get().catch(() => null),
              db.collection(getFirestoreCollection("notifications")).where("recipientUid", "==", cand).get().catch(() => null),
            ]);
            for (const s of snaps) {
              if (s && !s.empty) {
                const b = db.batch();
                s.docs.forEach((d) => b.update(d.ref, { read: true, isRead: true, readAt: Date.now() }));
                await b.commit();
              }
            }
          } catch {}
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
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
    const { userId, email, sk, all, pk, id } = body;

    const resolvedUserId =
      userId ?? (await resolveActualUserId(undefined, email)) ?? userId;
    const sanitizedFallback = sanitizeEmailFallback(email);
    const candidateSet = new Set<string>();

    if (pk) candidateSet.add(cleanId(pk));
    if (userId) candidateSet.add(cleanId(userId));
    if (email) candidateSet.add(cleanId(email));
    if (resolvedUserId) candidateSet.add(cleanId(resolvedUserId));
    if (sanitizedFallback) candidateSet.add(sanitizedFallback);

    const candidates = Array.from(candidateSet).filter(Boolean);
    const candidateTables = getCandidateTableNames(TABLES.Notifications);

    if (candidates.length === 0) {
      return NextResponse.json({ error: "userId or email is required" }, { status: 400 });
    }

    if (sk && !all) {
      for (const table of candidateTables) {
        for (const uidCandidate of candidates) {
          try {
            await docClient.send(
              new DeleteCommand({
                TableName: table,
                Key: { PK: `USER#${uidCandidate}`, SK: sk },
              })
            );
          } catch {}
        }
      }

      if (db && (id || sk)) {
        const docId = id || (sk ? sk.split("#").pop() : null);
        if (docId) {
          for (const cand of candidates) {
            await db.collection(getFirestoreCollection("notifications")).doc(`${docId}_${cand}`).delete().catch(() => {});
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    if (all) {
      for (const table of candidateTables) {
        for (const uidCandidate of candidates) {
          try {
            const res = await docClient.send(
              new QueryCommand({
                TableName: table,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
                ExpressionAttributeValues: {
                  ":pk": `USER#${uidCandidate}`,
                  ":prefix": "NOTIF#",
                },
              })
            );

            const items = res.Items ?? [];
            for (let i = 0; i < items.length; i += 25) {
              const chunk = items.slice(i, i + 25);
              await docClient.send(
                new BatchWriteCommand({
                  RequestItems: {
                    [table]: chunk.map((item) => ({
                      DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
                    })),
                  },
                })
              ).catch(() => {});
            }
          } catch {}
        }
      }

      if (db) {
        for (const cand of candidates) {
          try {
            const snaps = await Promise.all([
              db.collection(getFirestoreCollection("notifications")).where("recipientEmail", "==", cand).get().catch(() => null),
              db.collection(getFirestoreCollection("notifications")).where("recipientUid", "==", cand).get().catch(() => null),
            ]);
            for (const s of snaps) {
              if (s && !s.empty) {
                const b = db.batch();
                s.docs.forEach((d) => b.delete(d.ref));
                await b.commit();
              }
            }
          } catch {}
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