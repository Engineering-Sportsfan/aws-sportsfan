// app/api/engagements/cleanup-seeds/route.ts — Clean up initial static test seeds & orphan records
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { DeleteCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const STATIC_SEED_IDS = [
  "eng_fanbattle_virat_vs_babar",
  "eng_quiz_virat_test_centuries",
  "eng_poll_galle_wickets",
  "eng_pred_galle_test_outcome",
];

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let targetIds = [...STATIC_SEED_IDS];

    // Allow deleting a specific ID if provided in query or body
    const queryId = searchParams.get("id");
    if (queryId) {
      targetIds.push(queryId);
    }
    try {
      const body = await req.json();
      if (body?.id) targetIds.push(body.id);
      if (Array.isArray(body?.ids)) targetIds.push(...body.ids);
    } catch {}

    targetIds = Array.from(new Set(targetIds.filter(Boolean)));
    const deleted: string[] = [];

    // 1. Delete all records for targeted IDs (META, votes, likes) from DynamoDB
    for (const id of targetIds) {
      const cleanId = id.replace(/^ENGAGEMENT#/, "");
      try {
        const queryRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid",
            ExpressionAttributeValues: { ":cid": `ENGAGEMENT#${cleanId}` },
          })
        );

        if (queryRes.Items && queryRes.Items.length > 0) {
          for (const item of queryRes.Items) {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: item.contentId, sk: item.sk },
              })
            );
          }
        } else {
          // Direct delete of META record if query returned empty
          await docClient.send(
            new DeleteCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: "ENGAGEMENT#META" },
            })
          );
        }
      } catch (err: any) {
        console.warn(`DynamoDB delete notice for ${cleanId}:`, err?.message || err);
      }

      // 2. Delete from Firestore engagements
      if (db) {
        try {
          await db.collection(getFirestoreCollection("engagements")).doc(cleanId).delete();
        } catch (err: any) {
          console.warn(`Firestore delete notice for ${cleanId}:`, err?.message || err);
        }
      }

      deleted.push(cleanId);
    }

    // 3. Scan & remove any orphan/corrupted DynamoDB items that lack a title or type
    try {
      const scanAll = await docClient.send(
        new ScanCommand({
          TableName: TABLES.SocialAndContent,
          FilterExpression: "begins_with(contentId, :prefix)",
          ExpressionAttributeValues: { ":prefix": "ENGAGEMENT#" },
          Limit: 150,
        })
      );

      if (scanAll.Items) {
        for (const it of scanAll.Items) {
          // If a META item exists without a title or type, or is empty, delete it
          if (it.sk === "ENGAGEMENT#META" && (!it.title || !it.type)) {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: it.contentId, sk: it.sk },
              })
            );
            deleted.push(`${it.contentId}#META (untitled)`);
          }
        }
      }
    } catch (scanErr: any) {
      console.warn("DynamoDB orphan cleanup notice:", scanErr?.message || scanErr);
    }

    // 4. Clean up any title-less Firestore engagement documents
    if (db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).get();
        for (const doc of snap.docs) {
          const d = doc.data();
          if (!d.title || !d.type) {
            await doc.ref.delete();
            deleted.push(`${doc.id} (Firestore untitled)`);
          }
        }
      } catch (fbErr: any) {
        console.warn("Firestore orphan cleanup notice:", fbErr?.message || fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Static seeds and orphan records deleted successfully from DynamoDB and Firestore",
      deletedIds: deleted,
    });
  } catch (error: unknown) {
    console.error("Cleanup error:", error);
    const msg = error instanceof Error ? error.message : "Failed to clean up static seeds";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
