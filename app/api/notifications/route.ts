// app/api/notifications/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── GET — fetch notifications for a user + total unread count ────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const uid = searchParams.get("uid");
    const countOnly = searchParams.get("countOnly") === "true";

    if (!email && !uid) {
      return NextResponse.json({ error: "email or uid is required" }, { status: 400 });
    }

    let notifications: any[] = [];

    // 1.2 Query DynamoDB sf360-notifications table (new schema support)
    try {
      const pks = [];
      if (email) {
        pks.push(`USER#${email}`);
        pks.push(`USER#${email.toLowerCase()}`);
      }
      if (uid) {
        pks.push(`USER#${uid}`);
        pks.push(`USER#${uid.toLowerCase()}`);
      }
      const uniquePks = [...new Set(pks)];
      for (const pk of uniquePks) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "sf360-notifications",
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: {
              ":pk": pk,
              ":skPrefix": "NOTIF#",
            },
            ScanIndexForward: false,
            Limit: 50,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          qRes.Items.forEach((item) => {
            const id = (item.SK as string)?.split("#")[2] || item.notification_id || item.id;
            // Prevent duplicates
            if (!notifications.some(n => n.id === id || n.notification_id === id)) {
              notifications.push({
                id,
                ...item,
                isRead: item.read ?? item.isRead ?? false,
              });
            }
          });
        }
      }
    } catch (notifTableErr) {
      console.warn("DynamoDB sf360-notifications query notice:", notifTableErr);
    }

    notifications.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    if (countOnly) {
      return NextResponse.json({ success: true, unreadCount }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ success: true, notifications, unreadCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — create a single notification manually ────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recipientEmail,
      recipientUid,
      type,
      message,
      battleId,
      battleName,
      battleType,
      senderId,
      senderName,
      audioPublicId,
      audioTitle,
      audioUrl,
      audioDuration,
      audioDurationSeconds,
      audioFormat,
    } = body;

    if (!recipientEmail || !type || !message) {
      return NextResponse.json(
        { error: "recipientEmail, type, and message are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const notifId = `notif_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const payload: Record<string, unknown> = {
      id: notifId,
      recipientEmail,
      recipientUid: recipientUid ?? null,
      type,
      message,
      isRead: false,
      createdAt: now,
      ...(battleId && { battleId, battleName, battleType, senderId, senderName }),
      ...(audioPublicId && {
        audioPublicId,
        audioTitle,
        audioUrl,
        audioDuration,
        audioDurationSeconds,
        audioFormat,
        audioUploadedAt: now,
      }),
    };

    // ── Dual-Write to DynamoDB IdentityAndAccess & Firebase ───────────────────
    const dynamoItem = {
      entityId: `USER#${recipientEmail}`,
      sk: `NOTIF#${now}#${notifId}`,
      email: recipientEmail,
      ...payload,
    };

    await dualWrite("notifications", notifId, "IdentityAndAccess", dynamoItem);

    return NextResponse.json({ success: true, id: notifId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH — mark one or all notifications as read ───────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, action, sk } = body;

    if (action === "markRead" && id) {
      const ctaClicked: boolean = body.ctaClicked === true;
      // The frontend sends the exact PK and SK from the GET response.
      // PK format is USER#<userId> where userId may use underscores
      // (e.g. USER#rahul_yadav_sportsfan360_com) — NOT the email address.
      const exactPK: string | undefined = body.pk;
      const exactSK: string | undefined = body.sk || sk;

      // Build the update expression — always mark read, conditionally set cta_clicked
      const updateExpr = ctaClicked
        ? "SET #r = :t, isRead = :t, readAt = :now, cta_clicked = :t"
        : "SET #r = :t, isRead = :t, readAt = :now";
      const updateAttrs = {
        ExpressionAttributeNames: { "#r": "read" },
        ExpressionAttributeValues: { ":t": true, ":now": Date.now() },
      };

      // 1. Update Firebase
      try {
        await db.collection("notifications").doc(id).update({
          isRead: true,
          read: true,
          readAt: Date.now(),
          ...(ctaClicked && { cta_clicked: true }),
        });
      } catch (fbErr) {
        console.warn("Firebase markRead notice:", fbErr);
      }

      // 2. Update DynamoDB sf360-notifications
      try {
        if (exactPK && exactSK) {
          // ── Fast path: frontend provided exact PK + SK from the item ──────────
          // This is always correct regardless of userId format (underscores, email, etc.)
          await docClient.send(
            new UpdateCommand({
              TableName: "sf360-notifications",
              Key: { PK: exactPK, SK: exactSK },
              UpdateExpression: updateExpr,
              ...updateAttrs,
            })
          );
        } else if (email && exactSK) {
          // ── Have SK but no PK — try both email-derived PK variants ───────────
          const pkVariants = [...new Set([`USER#${email}`, `USER#${email.toLowerCase()}`])];
          for (const pk of pkVariants) {
            try {
              await docClient.send(
                new UpdateCommand({
                  TableName: "sf360-notifications",
                  Key: { PK: pk, SK: exactSK },
                  UpdateExpression: updateExpr,
                  ...updateAttrs,
                  ConditionExpression: "attribute_exists(PK)",
                })
              );
              break;
            } catch (condErr: any) {
              if (condErr?.name !== "ConditionalCheckFailedException") throw condErr;
            }
          }
        } else if (email) {
          // ── No SK provided — query to find the item ──────────────────────────
          const pks = [...new Set([`USER#${email}`, `USER#${email.toLowerCase()}`])];
          let found: any = null;
          for (const pk of pks) {
            const qRes = await docClient.send(
              new QueryCommand({
                TableName: "sf360-notifications",
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
                ExpressionAttributeValues: { ":pk": pk, ":skPrefix": "NOTIF#" },
              })
            );
            found = qRes.Items?.find(
              (item) => item.id === id || item.notification_id === id || (item.SK as string).endsWith(`#${id}`)
            );
            if (found) break;
          }
          if (found) {
            await docClient.send(
              new UpdateCommand({
                TableName: "sf360-notifications",
                Key: { PK: found.PK, SK: found.SK },
                UpdateExpression: updateExpr,
                ...updateAttrs,
              })
            );
          }
        }
      } catch (dynErr) {
        console.warn("DynamoDB markRead notice:", dynErr);
      }

      return NextResponse.json({ success: true });
    }

    if (action === "markAllRead" && (email || body.uid)) {
      const uid: string | undefined = body.uid;

      // 1. Update Firebase (by email only — Firestore uses recipientEmail)
      try {
        if (email) {
          const snapshot = await db
            .collection("notifications")
            .where("recipientEmail", "==", email)
            .where("isRead", "==", false)
            .get();

          if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
              batch.update(doc.ref, { isRead: true, read: true, readAt: Date.now() });
            });
            await batch.commit();
          }
        }
      } catch (fbErr) {
        console.warn("Firebase markAllRead notice:", fbErr);
      }

      // 2. Update DynamoDB sf360-notifications table
      // Query only items where read = false (FilterExpression) so we don't
      // waste writes on already-read notifications.
      try {
        // Build all PK variants from email and uid — the store writes PK: USER#${userId}
        // which can be an email OR a uid depending on how the notification was created.
        const pkSet = new Set<string>();
        if (email) {
          pkSet.add(`USER#${email}`);
          pkSet.add(`USER#${email.toLowerCase()}`);
        }
        if (uid) {
          pkSet.add(`USER#${uid}`);
          pkSet.add(`USER#${uid.toLowerCase()}`);
        }

        const seenSKs = new Set<string>();

        for (const pk of pkSet) {
          // FilterExpression: only fetch items where read = false
          // This ensures we only update genuinely unread notifications
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: "sf360-notifications",
              KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
              FilterExpression: "#r = :f",
              ExpressionAttributeNames: { "#r": "read" },
              ExpressionAttributeValues: {
                ":pk": pk,
                ":skPrefix": "NOTIF#",
                ":f": false,
              },
            })
          );

          for (const item of (qRes.Items ?? [])) {
            const sk = item.SK as string;
            if (seenSKs.has(sk)) continue; // skip duplicates across PK variants
            seenSKs.add(sk);

            await docClient.send(
              new UpdateCommand({
                TableName: "sf360-notifications",
                Key: { PK: item.PK, SK: sk },
                // Update both `read` (primary field) and `isRead` (alias field)
                UpdateExpression: "SET #r = :t, isRead = :t, readAt = :now",
                ExpressionAttributeNames: { "#r": "read" },
                ExpressionAttributeValues: { ":t": true, ":now": Date.now() },
              })
            );
          }
        }
      } catch (dynErr) {
        console.warn("DynamoDB markAllRead notice:", dynErr);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action or missing fields" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE — clear one notification or all for a user ───────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, all, sk } = body;

    if (id && !all) {
      // 1. Delete from Firebase
      try {
        await db.collection("notifications").doc(id).delete();
      } catch (fbErr) {
        console.warn("Firebase delete notif notice:", fbErr);
      }

      // 2. Delete from DynamoDB
      if (email) {
        try {
          let resolvedSk = sk;
          if (!resolvedSk) {
            const qRes = await docClient.send(
              new QueryCommand({
                TableName: "IdentityAndAccess",
                KeyConditionExpression: "entityId = :e AND begins_with(sk, :nPrefix)",
                ExpressionAttributeValues: {
                  ":e": `USER#${email}`,
                  ":nPrefix": "NOTIF#",
                },
              })
            );
            const found = qRes.Items?.find((item) => item.id === id || (item.sk as string).endsWith(`#${id}`));
            if (found) {
              resolvedSk = found.sk;
            }
          }

          if (resolvedSk) {
            await docClient.send(
              new DeleteCommand({
                TableName: "IdentityAndAccess",
                Key: { entityId: `USER#${email}`, sk: resolvedSk },
              })
            );
          }
        } catch (dynErr) {
          console.warn("DynamoDB delete notif notice:", dynErr);
        }
      }
      return NextResponse.json({ success: true });
    }

    if (email && all) {
      // 1. Delete from Firebase
      try {
        const snapshot = await db
          .collection("notifications")
          .where("recipientEmail", "==", email)
          .get();

        if (!snapshot.empty) {
          const batch = db.batch();
          snapshot.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
      } catch (fbErr) {
        console.warn("Firebase delete all notifs notice:", fbErr);
      }

      // 2. Delete from DynamoDB
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "IdentityAndAccess",
            KeyConditionExpression: "entityId = :e AND begins_with(sk, :nPrefix)",
            ExpressionAttributeValues: {
              ":e": `USER#${email}`,
              ":nPrefix": "NOTIF#",
            },
          })
        );
        for (const item of (qRes.Items ?? [])) {
          await docClient.send(
            new DeleteCommand({
              TableName: "IdentityAndAccess",
              Key: { entityId: item.entityId, sk: item.sk },
            })
          );
        }
      } catch (dynErr) {
        console.warn("DynamoDB delete all notifs notice:", dynErr);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Provide id for single delete, or email + all:true for bulk delete" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}