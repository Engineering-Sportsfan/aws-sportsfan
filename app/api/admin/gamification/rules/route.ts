// app/api/admin/gamification/rules/route.ts — Dynamic SXP Point Rules API
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { QueryCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export interface PointRuleItem {
  id: string; // e.g. "ENGAGEMENT_ACCURACY_BONUS_PREDICTION"
  name: string;
  category: "FlipArena" | "ROAR" | "Referrals" | "System";
  points: number;
  dailyLimit: number;
  status: "active" | "inactive";
  description?: string;
  updatedAt?: number;
}

function getCanonicalRuleId(rawId: string): string {
  const clean = rawId.trim().toUpperCase();
  if (clean === "ENGAGEMENT_PARTICIPATE_BATTLE" || clean === "ENGAGEMENT_PARTICIPATE_FAN_BATTLE") {
    return "ENGAGEMENT_PARTICIPATE_FAN_BATTLE";
  }
  if (clean === "ENGAGEMENT_WINNING_POLL_BONUS" || clean === "ENGAGEMENT_ACCURACY_BONUS_POLL") {
    return "ENGAGEMENT_ACCURACY_BONUS_POLL";
  }
  if (clean === "PREDICTION_ACCURATE" || clean === "ENGAGEMENT_ACCURACY_BONUS_PREDICTION") {
    return "ENGAGEMENT_ACCURACY_BONUS_PREDICTION";
  }
  return clean;
}

const DEFAULT_POINT_RULES: PointRuleItem[] = [
  // FlipArena Micro-Engagements
  { id: "ENGAGEMENT_PARTICIPATE_FAN_BATTLE", name: "Fan Battle Vote", category: "FlipArena", points: 2, dailyLimit: 100, status: "active", description: "Awarded for voting in a Fan Battle" },
  { id: "ENGAGEMENT_PARTICIPATE_POLL", name: "Live Poll Vote", category: "FlipArena", points: 2, dailyLimit: 100, status: "active", description: "Awarded for voting in a live poll" },
  { id: "ENGAGEMENT_PARTICIPATE_MEME", name: "Meme Arena Rating", category: "FlipArena", points: 2, dailyLimit: 100, status: "active", description: "Awarded for rating a fan meme" },
  { id: "ENGAGEMENT_PARTICIPATE_QUIZ", name: "Quiz Answer Submit", category: "FlipArena", points: 2, dailyLimit: 100, status: "active", description: "Awarded on submitting a quiz answer" },
  { id: "ENGAGEMENT_ACCURACY_BONUS_QUIZ", name: "Quiz Correct Answer Bonus", category: "FlipArena", points: 10, dailyLimit: 100, status: "active", description: "Bonus for selecting the correct quiz option" },
  { id: "ENGAGEMENT_PARTICIPATE_PREDICTION", name: "Match Prediction Submit", category: "FlipArena", points: 2, dailyLimit: 100, status: "active", description: "Awarded on submitting a prediction" },
  { id: "ENGAGEMENT_ACCURACY_BONUS_PREDICTION", name: "Correct Prediction Outcome", category: "FlipArena", points: 10, dailyLimit: 100, status: "active", description: "Bonus awarded when prediction is verified correct" },
  { id: "ENGAGEMENT_ACCURACY_BONUS_POLL", name: "Winning Poll Option Bonus", category: "FlipArena", points: 10, dailyLimit: 100, status: "active", description: "Bonus if user picked majority poll option" },
  { id: "ENGAGEMENT_CREATE_EVENT", name: "Create Arena Event", category: "FlipArena", points: 2, dailyLimit: 50, status: "active", description: "Awarded for creating a quiz, poll, battle" },

  // ROAR Live & Community
  { id: "FEED_LIKE", name: "Like / Reaction", category: "ROAR", points: 2, dailyLimit: 15, status: "active", description: "Awarded for reacting to a feed post or drop" },
  { id: "FEED_COMMENT", name: "Comment / Discussion", category: "ROAR", points: 8, dailyLimit: 20, status: "active", description: "Awarded for posting a constructive comment" },
  { id: "FEED_SHARE", name: "Share Post / Drop", category: "ROAR", points: 15, dailyLimit: 10, status: "active", description: "Awarded for sharing content" },
  { id: "CREATE_POST", name: "Create Standard Post", category: "ROAR", points: 65, dailyLimit: 5, status: "active", description: "Awarded for publishing a post" },
  { id: "CREATE_DEBATE", name: "Create Live Debate", category: "ROAR", points: 80, dailyLimit: 3, status: "active", description: "Awarded for starting a match debate" },
  { id: "UPLOAD_MEDIA", name: "Upload Photo / Media", category: "ROAR", points: 25, dailyLimit: 10, status: "active", description: "Awarded for photo uploads" },
  { id: "UPLOAD_FLIPLONG", name: "Upload Video / FlipLONG", category: "ROAR", points: 55, dailyLimit: 5, status: "active", description: "Awarded for video story uploads" },
  { id: "JOIN_WATCHALONG", name: "Join Watchalong Room", category: "ROAR", points: 10, dailyLimit: 3, status: "active", description: "Awarded for joining a live match room" },
  { id: "READ_NEWS", name: "Read News Article", category: "ROAR", points: 3, dailyLimit: 10, status: "active", description: "Awarded for reading articles" },

  // System, Global Streaks & Onboarding
  { id: "DAILY_LOGIN", name: "Daily Active Login", category: "System", points: 15, dailyLimit: 1, status: "active", description: "Global daily active login (multiplied by user login streak)" },
  { id: "WELCOME_BONUS", name: "New User Welcome Bonus", category: "System", points: 50, dailyLimit: 1, status: "active", description: "Granted upon signup & OTP verification" },
  { id: "REFERRAL_SIGNUP", name: "Invite Friend (Signup)", category: "Referrals", points: 50, dailyLimit: 50, status: "active", description: "Awarded when referred friend completes OTP signup" },
  { id: "REFERRAL_CHANT_REACHED", name: "Friend Reaches Chant Tier", category: "Referrals", points: 100, dailyLimit: 50, status: "active", description: "1-time payout when referred friend hits Chant rank" },
];

// ─── GET /api/admin/gamification/rules — List all SXP point rules ────────────
export async function GET() {
  try {
    const rulesMap = new Map<string, PointRuleItem>();

    // 1. Initialize with all default rules across all sections
    for (const def of DEFAULT_POINT_RULES) {
      rulesMap.set(getCanonicalRuleId(def.id), { ...def, id: getCanonicalRuleId(def.id) });
    }

    // 2. Overlay Firestore saved rules
    if (db) {
      try {
        const snap = await db.collection(getFirestoreCollection("pointRules")).get();
        if (!snap.empty) {
          snap.docs.forEach((doc) => {
            const data = doc.data();
            const canonicalId = getCanonicalRuleId(doc.id);
            const existing = rulesMap.get(canonicalId);
            rulesMap.set(canonicalId, {
              id: canonicalId,
              name: data.name || existing?.name || canonicalId,
              category: (data.category || existing?.category || "FlipArena") as PointRuleItem["category"],
              points: typeof data.points === "number" ? data.points : Number(data.points ?? existing?.points ?? 0),
              dailyLimit: typeof data.dailyLimit === "number" ? data.dailyLimit : Number(data.dailyLimit ?? existing?.dailyLimit ?? 100),
              status: (data.status === "inactive" ? "inactive" : "active") as "active" | "inactive",
              description: data.description || existing?.description || "",
              updatedAt: data.updatedAt || 0,
            });
          });
        }
      } catch (fsErr) {
        console.warn("[Gamification Rules GET] Firestore notice:", fsErr);
      }
    }

    // 3. Overlay DynamoDB saved rules (highest priority)
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLES.GamificationAndWallet,
          KeyConditionExpression: "userId = :uid AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":uid": "CONFIG#RULES",
            ":skPrefix": "RULE#",
          },
        })
      );
      if (res.Items && res.Items.length > 0) {
        res.Items.forEach((item: any) => {
          const rawId = item.id || (item.sk ? item.sk.replace(/^RULE#/i, "") : "");
          if (!rawId) return;
          const canonicalId = getCanonicalRuleId(rawId);
          const existing = rulesMap.get(canonicalId);
          rulesMap.set(canonicalId, {
            id: canonicalId,
            name: item.name || item.title || existing?.name || canonicalId,
            category: (item.category || existing?.category || "FlipArena") as PointRuleItem["category"],
            points: typeof item.points === "number" ? item.points : Number(item.points ?? existing?.points ?? 0),
            dailyLimit: typeof item.dailyLimit === "number" ? item.dailyLimit : Number(item.dailyLimit ?? existing?.dailyLimit ?? 100),
            status: (item.status === "inactive" ? "inactive" : "active") as "active" | "inactive",
            description: item.description || existing?.description || "",
            updatedAt: item.updatedAt || 0,
          });
        });
      }
    } catch (dynErr) {
      console.warn("[Gamification Rules GET] DynamoDB notice:", dynErr);
    }

    const rules = Array.from(rulesMap.values());
    return NextResponse.json({ success: true, rules, totalCount: rules.length });
  } catch (error) {
    console.error("[GET /api/admin/gamification/rules] error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch gamification rules" }, { status: 500 });
  }
}

// ─── POST / PUT /api/admin/gamification/rules — Save/Update a point rule ────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const name = String(body.name || id).trim();
    const category = (body.category || "FlipArena") as PointRuleItem["category"];
    const points = Math.max(0, parseInt(body.points, 10) || 0);
    const dailyLimit = Math.max(1, parseInt(body.dailyLimit, 10) || 100);
    const status = body.status === "inactive" ? "inactive" : "active";
    const description = String(body.description || "").trim();
    const now = Date.now();

    if (!id) {
      return NextResponse.json({ success: false, error: "Rule ID is required" }, { status: 400 });
    }

    const ruleItem: PointRuleItem = {
      id,
      name,
      category,
      points,
      dailyLimit,
      status,
      description,
      updatedAt: now,
    };

    // Determine possible alias keys for cross-system compatibility
    const aliasKeys = new Set<string>([id]);
    if (id === "ENGAGEMENT_PARTICIPATE_BATTLE" || id === "ENGAGEMENT_PARTICIPATE_FAN_BATTLE") {
      aliasKeys.add("ENGAGEMENT_PARTICIPATE_BATTLE");
      aliasKeys.add("ENGAGEMENT_PARTICIPATE_FAN_BATTLE");
    }
    if (id === "ENGAGEMENT_WINNING_POLL_BONUS" || id === "ENGAGEMENT_ACCURACY_BONUS_POLL") {
      aliasKeys.add("ENGAGEMENT_WINNING_POLL_BONUS");
      aliasKeys.add("ENGAGEMENT_ACCURACY_BONUS_POLL");
    }
    if (id === "ENGAGEMENT_ACCURACY_BONUS_PREDICTION" || id === "PREDICTION_ACCURATE") {
      aliasKeys.add("ENGAGEMENT_ACCURACY_BONUS_PREDICTION");
      aliasKeys.add("PREDICTION_ACCURATE");
    }
    if (id === "ENGAGEMENT_CREATE_EVENT") {
      aliasKeys.add("ENGAGEMENT_CREATE_EVENT");
      aliasKeys.add("ENGAGEMENT_CREATE_FAN_BATTLE");
      aliasKeys.add("ENGAGEMENT_CREATE_QUIZ");
      aliasKeys.add("ENGAGEMENT_CREATE_POLL");
      aliasKeys.add("ENGAGEMENT_CREATE_PREDICTION");
      aliasKeys.add("ENGAGEMENT_CREATE_MEME");
    }

    // 1. Save all alias keys to DynamoDB GamificationAndWallet
    for (const keyId of aliasKeys) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLES.GamificationAndWallet,
            Item: {
              userId: "CONFIG#RULES",
              sk: `RULE#${keyId}`,
              entityId: `RULE#${keyId}`,
              ...ruleItem,
              id: keyId,
            },
          })
        );
      } catch (dynErr) {
        console.warn("[Gamification Rules POST] DynamoDB write notice for", keyId, dynErr);
      }

      // 2. Dual-write to Firestore pointRules
      if (db) {
        try {
          await db.collection(getFirestoreCollection("pointRules")).doc(keyId).set({ ...ruleItem, id: keyId }, { merge: true });
        } catch (fsErr) {
          console.warn("[Gamification Rules POST] Firestore write notice for", keyId, fsErr);
        }
      }
    }

    return NextResponse.json({ success: true, rule: ruleItem });
  } catch (error) {
    console.error("[POST /api/admin/gamification/rules] error:", error);
    return NextResponse.json({ success: false, error: "Failed to save rule" }, { status: 500 });
  }
}

// ─── DELETE /api/admin/gamification/rules — Delete a custom rule ────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim().toUpperCase();

    if (!id) {
      return NextResponse.json({ success: false, error: "Rule ID is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.GamificationAndWallet,
          Key: {
            userId: "CONFIG#RULES",
            sk: `RULE#${id}`,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Gamification Rules DELETE] DynamoDB notice:", dynErr);
    }

    // 2. Delete from Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("pointRules")).doc(id).delete();
      } catch (fsErr) {
        console.warn("[Gamification Rules DELETE] Firestore notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, message: `Rule ${id} deleted successfully`, id });
  } catch (error) {
    console.error("[DELETE /api/admin/gamification/rules] error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete rule" }, { status: 500 });
  }
}
