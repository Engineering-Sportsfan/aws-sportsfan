// app/api/wt20-clubs/deltas/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const matchDay = searchParams.get("match_day");
  const clubId   = searchParams.get("club_id")?.toUpperCase();
  const limit    = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  try {
    let data: any[] = [];

    // 1. Try DynamoDB SportsData
    try {
      if (clubId) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "SportsData",
            KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":eId": `WT20_DELTA#${clubId}`,
              ":skPrefix": matchDay ? `DELTA#${matchDay}#` : "DELTA#",
            },
            ScanIndexForward: false,
            Limit: limit,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          data = qRes.Items;
        }
      } else {
        let filterExpr = "begins_with(entityId, :pfx)";
        const exprVals: Record<string, any> = { ":pfx": "WT20_DELTA#" };
        if (matchDay) {
          filterExpr += " AND match_day = :md";
          exprVals[":md"] = parseInt(matchDay, 10);
        }

        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: "SportsData",
            FilterExpression: filterExpr,
            ExpressionAttributeValues: exprVals,
            Limit: limit,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          data = scanRes.Items;
        }
      }
    } catch (e) {
      console.warn("[wt20 deltas GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (data.length === 0 && db) {
      let query: FirebaseFirestore.Query = db
        .collection("wt20DeltaLogs")
        .orderBy("match_day", "desc")
        .orderBy("ingested_at", "desc");

      if (matchDay) query = query.where("match_day", "==", parseInt(matchDay, 10));
      if (clubId)   query = query.where("club_id", "==", clubId);

      query = query.limit(limit);
      const snap = await query.get();
      data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    data.sort((a, b) => Number(b.match_day || 0) - Number(a.match_day || 0));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}