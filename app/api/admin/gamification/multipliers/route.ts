// app/api/admin/gamification/multipliers/route.ts — Dynamic Streak Multipliers & Boosts API
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export interface StreakBracket {
  days: number;
  multiplier: number;
  label: string;
}

export interface MultipliersConfig {
  matchDayBoost: number; // e.g. 1.2 (+20%)
  squadBoost: number; // e.g. 1.1 (+10%)
  dailyCapConsumption: number; // e.g. 300 SXP
  streakBrackets: StreakBracket[];
  updatedAt?: number;
}

const DEFAULT_MULTIPLIERS_CONFIG: MultipliersConfig = {
  matchDayBoost: 1.2,
  squadBoost: 1.1,
  dailyCapConsumption: 300,
  streakBrackets: [
    { days: 1, multiplier: 1.0, label: "1–2 Days (Base)" },
    { days: 3, multiplier: 1.1, label: "3–6 Days (+10%)" },
    { days: 7, multiplier: 1.25, label: "7–13 Days (+25%)" },
    { days: 14, multiplier: 1.5, label: "14–29 Days (+50%)" },
    { days: 30, multiplier: 1.75, label: "30–59 Days (+75%)" },
    { days: 60, multiplier: 2.0, label: "60+ Days (2.0x Double SXP)" },
  ],
};

// ─── GET /api/admin/gamification/multipliers — Get multipliers config ──────
export async function GET() {
  try {
    let config: MultipliersConfig | null = null;

    // 1. Try DynamoDB GamificationAndWallet
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: TABLES.GamificationAndWallet,
          Key: {
            userId: "CONFIG#MULTIPLIERS",
            sk: "MULTIPLIERS_CONFIG",
          },
        })
      );
      if (res.Item) {
        config = {
          matchDayBoost: Number(res.Item.matchDayBoost || 1.2),
          squadBoost: Number(res.Item.squadBoost || 1.1),
          dailyCapConsumption: Number(res.Item.dailyCapConsumption || 300),
          streakBrackets: Array.isArray(res.Item.streakBrackets) ? res.Item.streakBrackets : DEFAULT_MULTIPLIERS_CONFIG.streakBrackets,
          updatedAt: res.Item.updatedAt || 0,
        };
      }
    } catch (dynErr) {
      console.warn("[Gamification Multipliers GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore multipliers
    if (!config && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("multipliers")).doc("global").get();
        if (snap.exists) {
          const data = snap.data() || {};
          config = {
            matchDayBoost: Number(data.matchDayBoost || 1.2),
            squadBoost: Number(data.squadBoost || 1.1),
            dailyCapConsumption: Number(data.dailyCapConsumption || 300),
            streakBrackets: Array.isArray(data.streakBrackets) ? data.streakBrackets : DEFAULT_MULTIPLIERS_CONFIG.streakBrackets,
            updatedAt: data.updatedAt || 0,
          };
        }
      } catch (fsErr) {
        console.warn("[Gamification Multipliers GET] Firestore notice:", fsErr);
      }
    }

    if (!config) {
      config = DEFAULT_MULTIPLIERS_CONFIG;
    }

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("[GET /api/admin/gamification/multipliers] error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch multipliers config" }, { status: 500 });
  }
}

// ─── POST /api/admin/gamification/multipliers — Save multipliers config ────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const matchDayBoost = Math.max(1.0, parseFloat(body.matchDayBoost) || 1.2);
    const squadBoost = Math.max(1.0, parseFloat(body.squadBoost) || 1.1);
    const dailyCapConsumption = Math.max(50, parseInt(body.dailyCapConsumption, 10) || 300);
    const streakBrackets: StreakBracket[] = Array.isArray(body.streakBrackets)
      ? body.streakBrackets.map((b: any) => ({
          days: Math.max(1, parseInt(b.days, 10) || 1),
          multiplier: Math.max(1.0, parseFloat(b.multiplier) || 1.0),
          label: String(b.label || `${b.days} Days (${b.multiplier}x)`).trim(),
        }))
      : DEFAULT_MULTIPLIERS_CONFIG.streakBrackets;
    const now = Date.now();

    const configItem: MultipliersConfig = {
      matchDayBoost,
      squadBoost,
      dailyCapConsumption,
      streakBrackets,
      updatedAt: now,
    };

    // 1. Save to DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.GamificationAndWallet,
          Item: {
            userId: "CONFIG#MULTIPLIERS",
            sk: "MULTIPLIERS_CONFIG",
            entityId: "CONFIG#MULTIPLIERS",
            ...configItem,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Gamification Multipliers POST] DynamoDB write notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("multipliers")).doc("global").set(configItem, { merge: true });
      } catch (fsErr) {
        console.warn("[Gamification Multipliers POST] Firestore write notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, config: configItem });
  } catch (error) {
    console.error("[POST /api/admin/gamification/multipliers] error:", error);
    return NextResponse.json({ success: false, error: "Failed to save multipliers config" }, { status: 500 });
  }
}
