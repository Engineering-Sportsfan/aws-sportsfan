// app/api/admin/gamification/tiers/route.ts — Dynamic Global Reputation Tiers API
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { QueryCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export interface GlobalTierConfigItem {
  id: string; // e.g. "TIER_1_SPARK"
  tierLevel: number;
  name: string;
  minSXP: number;
  maxSXP: number | null; // null for pinnacle tier
  subLevels: number; // e.g. 3 for Spark I, II, III
  badgeColor: string;
  description?: string;
  updatedAt?: number;
}

const DEFAULT_GLOBAL_TIERS: GlobalTierConfigItem[] = [
  { id: "TIER_1_SPARK", tierLevel: 1, name: "Spark", minSXP: 0, maxSXP: 999, subLevels: 3, badgeColor: "#FF9800", description: "Entry prestige rank (Spark I, II, III)" },
  { id: "TIER_2_CHANT", tierLevel: 2, name: "Chant", minSXP: 1000, maxSXP: 3999, subLevels: 3, badgeColor: "#2196F3", description: "Active contributor rank (Chant I, II, III)" },
  { id: "TIER_3_ROAR", tierLevel: 3, name: "Roar", minSXP: 4000, maxSXP: 11999, subLevels: 3, badgeColor: "#9C27B0", description: "Dedicated room voice (Roar I, II, III)" },
  { id: "TIER_4_STORM", tierLevel: 4, name: "Storm", minSXP: 12000, maxSXP: 29999, subLevels: 3, badgeColor: "#E91E63", description: "Passionate fan leader (Storm I, II, III)" },
  { id: "TIER_5_LEGEND", tierLevel: 5, name: "Legend", minSXP: 30000, maxSXP: 74999, subLevels: 3, badgeColor: "#4CAF50", description: "Elite community pillar (Legend I, II, III)" },
  { id: "TIER_6_ICON", tierLevel: 6, name: "Icon", minSXP: 75000, maxSXP: 149999, subLevels: 3, badgeColor: "#00BCD4", description: "Hall of fame contender (Icon I, II, III)" },
  { id: "TIER_7_GOAT", tierLevel: 7, name: "GOAT", minSXP: 150000, maxSXP: null, subLevels: 1, badgeColor: "#FFD700", description: "Peak all-time fan status" },
];

// ─── GET /api/admin/gamification/tiers — List all global tiers ──────────────
export async function GET() {
  try {
    const tiersMap = new Map<string, GlobalTierConfigItem>();

    // 1. Initialize with all default tiers
    for (const def of DEFAULT_GLOBAL_TIERS) {
      tiersMap.set(def.id, { ...def });
    }

    // 2. Overlay Firestore reputationTiers
    if (db) {
      try {
        const snap = await db.collection(getFirestoreCollection("reputationTiers")).orderBy("tierLevel", "asc").get();
        if (!snap.empty) {
          snap.docs.forEach((doc) => {
            const data = doc.data();
            const existing = tiersMap.get(doc.id);
            tiersMap.set(doc.id, {
              id: doc.id,
              tierLevel: Number(data.tierLevel ?? existing?.tierLevel ?? 1),
              name: data.name || existing?.name || doc.id,
              minSXP: Number(data.minSXP ?? existing?.minSXP ?? 0),
              maxSXP: data.maxSXP !== null && data.maxSXP !== undefined ? Number(data.maxSXP) : (existing?.maxSXP ?? null),
              subLevels: Math.max(1, Number(data.subLevels ?? existing?.subLevels ?? 3)),
              badgeColor: data.badgeColor || existing?.badgeColor || "#FF9800",
              description: data.description || existing?.description || "",
              updatedAt: data.updatedAt || 0,
            });
          });
        }
      } catch (fsErr) {
        console.warn("[Gamification Tiers GET] Firestore notice:", fsErr);
      }
    }

    // 3. Overlay DynamoDB saved tiers (highest priority)
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLES.GamificationAndWallet,
          KeyConditionExpression: "userId = :uid AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":uid": "CONFIG#TIERS",
            ":skPrefix": "TIER#",
          },
        })
      );
      if (res.Items && res.Items.length > 0) {
        res.Items.forEach((item: any) => {
          const id = item.id || (item.sk ? item.sk.replace(/^TIER#/i, "") : "");
          if (!id) return;
          const existing = tiersMap.get(id);
          tiersMap.set(id, {
            id,
            tierLevel: Number(item.tierLevel ?? existing?.tierLevel ?? 1),
            name: item.name || existing?.name || id,
            minSXP: Number(item.minSXP ?? existing?.minSXP ?? 0),
            maxSXP: item.maxSXP !== null && item.maxSXP !== undefined ? Number(item.maxSXP) : (existing?.maxSXP ?? null),
            subLevels: Math.max(1, Number(item.subLevels ?? existing?.subLevels ?? 3)),
            badgeColor: item.badgeColor || existing?.badgeColor || "#FF9800",
            description: item.description || existing?.description || "",
            updatedAt: item.updatedAt || 0,
          });
        });
      }
    } catch (dynErr) {
      console.warn("[Gamification Tiers GET] DynamoDB notice:", dynErr);
    }

    const tiers = Array.from(tiersMap.values()).sort((a, b) => a.tierLevel - b.tierLevel);
    return NextResponse.json({ success: true, tiers, totalCount: tiers.length });
  } catch (error) {
    console.error("[GET /api/admin/gamification/tiers] error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch reputation tiers" }, { status: 500 });
  }
}

// ─── POST /api/admin/gamification/tiers — Create/Update a reputation tier ───
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const tierLevel = Math.max(1, parseInt(body.tierLevel, 10) || 1);
    const id = String(body.id || `TIER_${tierLevel}_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`).trim();
    const minSXP = Math.max(0, parseInt(body.minSXP, 10) || 0);
    const maxSXP = body.maxSXP === null || body.maxSXP === undefined || body.maxSXP === "" ? null : Math.max(minSXP + 1, parseInt(body.maxSXP, 10));
    const subLevels = Math.max(1, Math.min(10, parseInt(body.subLevels, 10) || 3));
    const badgeColor = String(body.badgeColor || "#FF9800").trim();
    const description = String(body.description || "").trim();
    const now = Date.now();

    if (!name) {
      return NextResponse.json({ success: false, error: "Tier name is required" }, { status: 400 });
    }

    const tierItem: GlobalTierConfigItem = {
      id,
      tierLevel,
      name,
      minSXP,
      maxSXP,
      subLevels,
      badgeColor,
      description,
      updatedAt: now,
    };

    // 1. Save to DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.GamificationAndWallet,
          Item: {
            userId: "CONFIG#TIERS",
            sk: `TIER#${id}`,
            entityId: `TIER#${id}`,
            ...tierItem,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Gamification Tiers POST] DynamoDB write notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("reputationTiers")).doc(id).set(tierItem, { merge: true });
      } catch (fsErr) {
        console.warn("[Gamification Tiers POST] Firestore write notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, tier: tierItem });
  } catch (error) {
    console.error("[POST /api/admin/gamification/tiers] error:", error);
    return NextResponse.json({ success: false, error: "Failed to save tier" }, { status: 500 });
  }
}

// ─── DELETE /api/admin/gamification/tiers — Delete a custom tier ───────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();

    if (!id) {
      return NextResponse.json({ success: false, error: "Tier ID is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.GamificationAndWallet,
          Key: {
            userId: "CONFIG#TIERS",
            sk: `TIER#${id}`,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Gamification Tiers DELETE] DynamoDB notice:", dynErr);
    }

    // 2. Delete from Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("reputationTiers")).doc(id).delete();
      } catch (fsErr) {
        console.warn("[Gamification Tiers DELETE] Firestore notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, message: `Tier ${id} deleted successfully`, id });
  } catch (error) {
    console.error("[DELETE /api/admin/gamification/tiers] error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete tier" }, { status: 500 });
  }
}
