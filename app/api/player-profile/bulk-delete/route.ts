// app/api/player-profile/bulk-delete/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  try {
    const { confirm } = await req.json();

    if (!confirm || confirm !== "DELETE_ALL") {
      return NextResponse.json(
        { success: false, message: 'Must confirm with "DELETE_ALL"' },
        { status: 400 }
      );
    }

    const prefixes = [
      "PLAYER_PROFILE#",
      "PLAYER_HOME#",
      "PLAYER_MEDIA#",
      "PLAYER_INSIGHT#",
      "PLAYER_SEASON#",
    ];

    // Delete matching items from DynamoDB SportsData
    try {
      for (const prefix of prefixes) {
        let lastKey: Record<string, any> | undefined;
        do {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: "SportsData",
              FilterExpression: "begins_with(entityId, :pfx)",
              ExpressionAttributeValues: { ":pfx": prefix },
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
      }
    } catch (e) {
      console.warn("[bulk-delete DynamoDB SportsData]:", e);
    }

    const results: Record<string, number> = {
      PlayerProfiles: 0,
      playershome: 0,
      playerMedia: 0,
      playerInsights: 0,
      playerSeasons: 0,
    };

    const BATCH_LIMIT = 300;
    const collections = [
      "PlayerProfiles",
      "playershome",
      "playerMedia",
      "playerInsights",
      "playerSeasons",
    ];

    if (db) {
      for (const colName of collections) {
        let deletedCount = 0;
        let lastDoc = null;
        const collectionRef = db.collection(colName);

        while (true) {
          let query = collectionRef.limit(BATCH_LIMIT);
          if (lastDoc) {
            query = query.startAfter(lastDoc);
          }

          const snapshot = await query.get();
          if (snapshot.empty) {
            break;
          }

          const batch = db.batch();
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
            deletedCount++;
          });

          await batch.commit();
          lastDoc = snapshot.docs[snapshot.docs.length - 1];

          if (snapshot.size < BATCH_LIMIT) {
            break;
          }
        }
        results[colName] = deletedCount;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted profiles and associated data across DynamoDB & Firestore`,
      results,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Bulk delete failed: " + (error as Error).message,
      },
      { status: 500 }
    );
  }
}