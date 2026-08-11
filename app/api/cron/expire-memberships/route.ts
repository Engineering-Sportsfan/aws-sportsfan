// app/api/cron/expire-memberships/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    let expiredCount = 0;
    let autoRenewLogCount = 0;

    // 1. Process via Firestore if available
    if (db) {
      const snapshot = await db
        .collection("userMemberships")
        .where("autoRenew", "==", false)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (
          (data.status === "active" || data.status === "cancelled") &&
          data.renewalDate &&
          data.renewalDate <= nowIso
        ) {
          const updated = {
            ...data,
            status: "expired",
            updatedAt: nowIso,
          };
          const dynamoItem = {
            userId: `USER#${doc.id}`,
            sk: `MEMBERSHIP#${doc.id}`,
            ...updated,
          };
          await dualWrite("userMemberships", doc.id, "GamificationAndWallet", dynamoItem);
          expiredCount++;
        }
      }

      const autoRenewSnapshot = await db
        .collection("userMemberships")
        .where("autoRenew", "==", true)
        .where("status", "==", "active")
        .get();

      for (const doc of autoRenewSnapshot.docs) {
        const data = doc.data();
        if (data.renewalDate && data.renewalDate <= nowIso) {
          autoRenewLogCount++;
          const updated = {
            ...data,
            renewalOverdue: true,
            updatedAt: nowIso,
          };
          const dynamoItem = {
            userId: `USER#${doc.id}`,
            sk: `MEMBERSHIP#${doc.id}`,
            ...updated,
          };
          await dualWrite("userMemberships", doc.id, "GamificationAndWallet", dynamoItem);
          console.log(`[expireMemberships] User membership ${doc.id} autoRenew is true, past renewalDate (${data.renewalDate}). Marked renewalOverdue: true.`);
        }
      }
    } else {
      // DynamoDB Direct Scan
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: "GamificationAndWallet",
            FilterExpression: "begins_with(userId, :uPrefix) AND begins_with(sk, :mPrefix)",
            ExpressionAttributeValues: {
              ":uPrefix": "USER#",
              ":mPrefix": "MEMBERSHIP#",
            },
          })
        );

        if (scanRes.Items) {
          for (const item of scanRes.Items) {
            const uid = (item.userId as string).replace(/^USER#/, "");
            if (
              item.autoRenew === false &&
              (item.status === "active" || item.status === "cancelled") &&
              item.renewalDate &&
              item.renewalDate <= nowIso
            ) {
              const updated = {
                ...item,
                status: "expired",
                updatedAt: nowIso,
              };
              await dualWrite("userMemberships", uid, "GamificationAndWallet", updated);
              expiredCount++;
            } else if (
              item.autoRenew === true &&
              item.status === "active" &&
              item.renewalDate &&
              item.renewalDate <= nowIso
            ) {
              autoRenewLogCount++;
              const updated = {
                ...item,
                renewalOverdue: true,
                updatedAt: nowIso,
              };
              await dualWrite("userMemberships", uid, "GamificationAndWallet", updated);
            }
          }
        }
      } catch (e) {
        console.warn("[expire-memberships] DynamoDB scan notice:", e);
      }
    }

    return NextResponse.json({
      success: true,
      expiredCount,
      autoRenewPendingReviewCount: autoRenewLogCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to run expireMemberships cron" },
      { status: 500 }
    );
  }
}
