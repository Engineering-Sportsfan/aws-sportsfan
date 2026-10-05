// app/api/admin/sports/route.ts — Universal Sports Management API
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export interface SportItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ─── GET /api/admin/sports — List all sports ────────────────────────────────
export async function GET() {
  try {
    let sports: SportItem[] = [];

    // 1. Try DynamoDB MS_Sports table
    try {
      const res = await docClient.send(
        new ScanCommand({
          TableName: TABLES.MS_Sports,
        })
      );
      if (res.Items && res.Items.length > 0) {
        sports = res.Items.map((item: any) => ({
          id: item.id || (item.entityId ? item.entityId.replace(/^SPORT#/i, "") : ""),
          name: item.name || item.title || item.sport || "",
          createdAt: item.createdAt || 0,
          updatedAt: item.updatedAt || 0,
        })).filter(s => s.id && s.name);
      }
    } catch (dynErr) {
      console.warn("[Sports GET] DynamoDB MS_Sports scan fallback:", dynErr);
    }

    // 2. Fallback to Firestore if DynamoDB returned empty
    if (sports.length === 0 && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("sports")).get();
        if (!snap.empty) {
          sports = snap.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || data.title || doc.id,
              createdAt: data.createdAt || 0,
              updatedAt: data.updatedAt || 0,
            };
          });
        }
      } catch (fsErr) {
        console.warn("[Sports GET] Firestore sports fetch notice:", fsErr);
      }
    }

    // Seed defaults if totally empty
    if (sports.length === 0) {
      sports = [
        { id: "cricket", name: "Cricket", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "football", name: "Football", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "athletics", name: "Athletics", createdAt: Date.now(), updatedAt: Date.now() },
      ];
    }

    sports.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, sports });
  } catch (error) {
    console.error("[GET /api/admin/sports] error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch sports" }, { status: 500 });
  }
}

// ─── POST /api/admin/sports — Create new sport ──────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json({ success: false, error: "Sport name is required" }, { status: 400 });
    }

    const id = String(body.id || name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "")).trim();
    const now = Date.now();

    const sportItem: SportItem = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Save to DynamoDB MS_Sports
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.MS_Sports,
          Item: {
            entityId: `SPORT#${id}`,
            sk: "SPORT#META",
            ...sportItem,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Sports POST] DynamoDB write notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("sports")).doc(id).set(sportItem, { merge: true });
      } catch (fsErr) {
        console.warn("[Sports POST] Firestore write notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, sport: sportItem });
  } catch (error) {
    console.error("[POST /api/admin/sports] error:", error);
    return NextResponse.json({ success: false, error: "Failed to create sport" }, { status: 500 });
  }
}
