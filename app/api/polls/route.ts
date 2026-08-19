// app/api/polls/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { Timestamp } from "firebase-admin/firestore";
import { CreatePollBody, Poll, PollOption } from "@/types/polls";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unknown error occurred";
}

// ─── GET /api/polls ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeFilter = searchParams.get("active");
    const typeFilter = searchParams.get("type");

    let polls: Poll[] = [];

    // 1. Try DynamoDB SocialAndContent table
    try {
      let filterExpr = "begins_with(contentId, :pPrefix)";
      const exprVals: Record<string, any> = {
        ":pPrefix": "POLL#",
      };

      if (activeFilter === "true") {
        filterExpr += " AND active = :act";
        exprVals[":act"] = true;
      } else if (activeFilter === "false") {
        filterExpr += " AND active = :act";
        exprVals[":act"] = false;
      }
      if (typeFilter) {
        filterExpr += " AND #tp = :tp";
        exprVals[":tp"] = typeFilter;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: filterExpr,
          ExpressionAttributeNames: typeFilter ? { "#tp": "type" } : undefined,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        polls = scanRes.Items.map((item) => ({
          id: item.id || (item.contentId as string).replace(/^POLL#/, ""),
          title: item.title,
          type: item.type,
          options: item.options,
          active: item.active,
          endsAt: typeof item.endsAt === "number" ? new Date(item.endsAt).toISOString() : item.endsAt,
          createdAt: typeof item.createdAt === "number" ? new Date(item.createdAt).toISOString() : item.createdAt,
        }));
      }
    } catch (e) {
      console.warn("[polls GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (polls.length === 0 && db) {
      let query: FirebaseFirestore.Query = db.collection("polls").orderBy("createdAt", "desc");

      if (activeFilter === "true") query = query.where("active", "==", true);
      if (activeFilter === "false") query = query.where("active", "==", false);
      if (typeFilter) query = query.where("type", "==", typeFilter);

      const snap = await query.get();
      polls = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          type: data.type,
          options: data.options,
          active: data.active,
          endsAt: data.endsAt instanceof Timestamp ? data.endsAt.toDate().toISOString() : data.endsAt,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        };
      });
    }

    polls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, data: polls });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(err) }, { status: 500 });
  }
}

// ─── POST /api/polls ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: CreatePollBody = await req.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });
    }
    if (!["poll", "quiz"].includes(body.type)) {
      return NextResponse.json({ success: false, error: "type must be poll or quiz" }, { status: 400 });
    }
    if (!body.options || body.options.length < 2) {
      return NextResponse.json({ success: false, error: "At least 2 options required" }, { status: 400 });
    }
    if (!body.endsAt) {
      return NextResponse.json({ success: false, error: "endsAt is required" }, { status: 400 });
    }
    if (body.type === "quiz" && !body.options.some((o) => o.isCorrect)) {
      return NextResponse.json({ success: false, error: "Quiz must have at least one correct option" }, { status: 400 });
    }

    const options: PollOption[] = body.options.map((o, i) => ({
      id: `opt_${i + 1}`,
      label: o.label.trim(),
      votes: 0,
      ...(body.type === "quiz" ? { isCorrect: !!o.isCorrect } : {}),
    }));

    const nowMillis = Date.now();
    const id = `poll_${nowMillis}_${Math.random().toString(36).substring(2, 9)}`;

    const newPoll = {
      id,
      title: body.title.trim(),
      type: body.type,
      options,
      active: true,
      endsAt: new Date(body.endsAt).toISOString(),
      createdAt: new Date(nowMillis).toISOString(),
    };

    // Dual-write
    await dualWrite({
      tableName: "SocialAndContent",
      dynamoItem: {
        contentId: `POLL#${id}`,
        sk: `POLL#${nowMillis}`,
        ...newPoll,
      },
      firestoreRef: db.collection("polls").doc(id),
      firestoreData: {
        ...newPoll,
        endsAt: Timestamp.fromDate(new Date(body.endsAt)),
        createdAt: Timestamp.fromMillis(nowMillis),
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: newPoll,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(err) }, { status: 500 });
  }
}