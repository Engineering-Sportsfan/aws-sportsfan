import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { CreatePollBody, Poll, PollOption } from "@/types/polls";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unknown error occurred";
}

// ─── GET /api/polls ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeFilter = searchParams.get("active");
    const typeFilter = searchParams.get("type");

    let query: FirebaseFirestore.Query = db.collection("polls").orderBy("createdAt", "desc");

    if (activeFilter === "true") query = query.where("active", "==", true);
    if (activeFilter === "false") query = query.where("active", "==", false);
    if (typeFilter) query = query.where("type", "==", typeFilter);

    const snap = await query.get();
    const polls: Poll[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title,
        type: data.type,
        options: data.options,
        active: data.active,
        endsAt: (data.endsAt as Timestamp).toDate().toISOString(),
        createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
      };
    });

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

    const now = Timestamp.now();
    const docRef = db.collection("polls").doc();

    const newPoll = {
      title: body.title.trim(),
      type: body.type,
      options,
      active: true,
      endsAt: Timestamp.fromDate(new Date(body.endsAt)),
      createdAt: now,
    };

    await docRef.set(newPoll);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: docRef.id,
          ...newPoll,
          endsAt: new Date(body.endsAt).toISOString(),
          createdAt: now.toDate().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(err) }, { status: 500 });
  }
}