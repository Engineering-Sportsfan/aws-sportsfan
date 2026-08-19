// app/api/player-profile/home/bulk/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const batchSize = parseInt(searchParams.get("batchSize") || "100");
    const action = searchParams.get("action");
    const confirm = searchParams.get("confirm");

    if (action === "all") {
      if (confirm !== "yes-i-really-want-to-delete-all-data") {
        return NextResponse.json(
          { 
            success: false, 
            message: "⚠️ DANGER: This will delete ALL data in playershome collection. Use confirm='yes-i-really-want-to-delete-all-data' to proceed",
            requiredConfirm: "yes-i-really-want-to-delete-all-data"
          },
          { status: 400 }
        );
      }

      // Delete from DynamoDB SportsData
      try {
        let lastKey: Record<string, any> | undefined;
        do {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: "SportsData",
              FilterExpression: "begins_with(entityId, :hPrefix)",
              ExpressionAttributeValues: { ":hPrefix": "PLAYER_HOME#" },
              ExclusiveStartKey: lastKey,
              Limit: 25,
            })
          );

          if (scanRes.Items && scanRes.Items.length > 0) {
            const deleteReqs = scanRes.Items.map((item) => ({
              DeleteRequest: {
                Key: {
                  entityId: item.entityId,
                  sk: item.sk,
                },
              },
            }));

            await docClient.send(
              new BatchWriteCommand({
                RequestItems: {
                  SportsData: deleteReqs,
                },
              })
            );
          }

          lastKey = scanRes.LastEvaluatedKey;
        } while (lastKey);
      } catch (e) {
        console.warn("[playershome bulk delete DynamoDB]:", e);
      }

      // Delete from Firestore
      let deletedCount = 0;
      if (db) {
        let hasMore = true;
        let lastDoc = null;

        while (hasMore) {
          let query = db.collection("playershome")
            .orderBy("createdAt", "desc")
            .limit(batchSize);
          
          if (lastDoc) {
            query = query.startAfter(lastDoc);
          }
          
          const snapshot = await query.get();
          if (snapshot.empty) {
            hasMore = false;
            break;
          }
          
          const batch = db.batch();
          snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          deletedCount += snapshot.size;
          lastDoc = snapshot.docs[snapshot.docs.length - 1];
        }
      }

      return NextResponse.json({
        success: true,
        message: `✅ Successfully deleted records from playershome collection`,
        deletedCount,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}