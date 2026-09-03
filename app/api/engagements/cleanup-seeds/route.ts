// app/api/engagements/cleanup-seeds/route.ts — Clean up initial static test seeds
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const STATIC_SEED_IDS = [
  "eng_fanbattle_virat_vs_babar",
  "eng_quiz_virat_test_centuries",
  "eng_poll_galle_wickets",
  "eng_pred_galle_test_outcome",
];

export async function POST(req: NextRequest) {
  try {
    const deleted: string[] = [];

    for (const id of STATIC_SEED_IDS) {
      // 1. Delete from DynamoDB SocialAndContent
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
          })
        );
      } catch (err: any) {
        console.warn(`DynamoDB delete notice for ${id}:`, err?.message || err);
      }

      // 2. Delete from Firestore engagements
      if (db) {
        try {
          await db.collection("engagements").doc(id).delete();
        } catch (err: any) {
          console.warn(`Firestore delete notice for ${id}:`, err?.message || err);
        }
      }

      deleted.push(id);
    }

    return NextResponse.json({
      success: true,
      message: "Initial static seed posts deleted successfully from DynamoDB and Firestore",
      deletedIds: deleted,
    });
  } catch (error: unknown) {
    console.error("Cleanup error:", error);
    const msg = error instanceof Error ? error.message : "Failed to clean up static seeds";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
