// app/api/admin/gamification/thresholds/route.ts — Feature Badge Ladders & Cutoffs API
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export interface FeatureThresholdItem {
  id: string; // e.g. "prediction"
  name: string;
  category: "Predictions" | "Trivia" | "Fan Battles" | "Posts" | "Debates" | "Community" | "Shares" | "Comments" | "Media" | "Referrals" | "Custom";
  thresholds: number[]; // e.g. [1, 10, 30, 75, 150]
  names: string[]; // e.g. ["Predictor", "Forecaster", "Oracle", "Visionary", "Prediction Legend"]
  icons?: string[]; // Cloudinary secure_urls for each badge level
  unit: string; // e.g. "correct predictions", "votes", "shares"
  updatedAt?: number;
}

const DEFAULT_FEATURE_LADDERS: FeatureThresholdItem[] = [
  {
    id: "prediction",
    name: "Predictions Ladder",
    category: "Predictions",
    thresholds: [1, 10, 30, 75, 150],
    names: ["Predictor", "Forecaster", "Oracle", "Visionary", "Prediction Legend"],
    icons: [
      "/images/badges/predictionl1.png",
      "/images/badges/predictionl2.png",
      "/images/badges/predictionl3.png",
      "/images/badges/predictionl4.png",
      "/images/badges/predictionl5.png",
    ],
    unit: "correct predictions",
  },
  {
    id: "trivia",
    name: "Trivia & Quizzes Ladder",
    category: "Trivia",
    thresholds: [1, 10, 30, 75, 150],
    names: ["Rookie Quizzer", "Brainiac", "Sports Scholar", "Quiz Master", "Hall of Fame"],
    icons: [
      "/images/badges/trivial1.png",
      "/images/badges/trivial2.png",
      "/images/badges/trivial3.png",
      "/images/badges/trivial4.png",
      "/images/badges/trivial5.png",
    ],
    unit: "correct answers",
  },
  {
    id: "fanBattle",
    name: "Fan Battles Ladder",
    category: "Fan Battles",
    thresholds: [1, 5, 15, 35, 80],
    names: ["Contender", "Fighter", "Champion", "Gladiator", "Arena Legend"],
    icons: [
      "/images/badges/fanBattlel1.png",
      "/images/badges/fanBattlel2.png",
      "/images/badges/fanBattlel3.png",
      "/images/badges/fanBattlel4.png",
      "/images/badges/fanBattlel5.png",
    ],
    unit: "battle votes",
  },
  {
    id: "post",
    name: "Posts & Stories Ladder",
    category: "Posts",
    thresholds: [1, 5, 15, 40, 100],
    names: ["Rookie Writer", "Story Teller", "Headliner", "Trend Maker", "News Breaker"],
    icons: [
      "/images/badges/postl1.png",
      "/images/badges/postl2.png",
      "/images/badges/postl3.png",
      "/images/badges/postl4.png",
      "/images/badges/postl5.png",
    ],
    unit: "published posts",
  },
  {
    id: "debate",
    name: "Live Debates Ladder",
    category: "Debates",
    thresholds: [1, 5, 15, 40, 100],
    names: ["Challenger", "Debater", "Analyst", "Strategist", "Debate Master"],
    icons: [
      "/images/badges/debatel1.png",
      "/images/badges/debatel2.png",
      "/images/badges/debatel3.png",
      "/images/badges/debatel4.png",
      "/images/badges/debatel5.png",
    ],
    unit: "debates created",
  },
  {
    id: "community",
    name: "Community Reactions Ladder",
    category: "Community",
    thresholds: [10, 50, 150, 400, 1000],
    names: ["Appreciated", "Popular", "Fan Favorite", "Crowd Hero", "Community Icon"],
    icons: [
      "/images/badges/communityl1.png",
      "/images/badges/communityl2.png",
      "/images/badges/communityl3.png",
      "/images/badges/communityl4.png",
      "/images/badges/communityl5.png",
    ],
    unit: "reactions received",
  },
  {
    id: "shares",
    name: "Virality & Shares Ladder",
    category: "Shares",
    thresholds: [5, 25, 75, 200, 500],
    names: ["Messenger", "Amplifier", "Influencer", "Viral Voice", "Global Fan"],
    icons: [
      "/images/badges/sharesl1.png",
      "/images/badges/sharesl2.png",
      "/images/badges/sharesl3.png",
      "/images/badges/sharesl4.png",
      "/images/badges/sharesl5.png",
    ],
    unit: "shares",
  },
  {
    id: "comments",
    name: "Comments & Discussions Ladder",
    category: "Comments",
    thresholds: [10, 50, 150, 400, 1000],
    names: ["Participant", "Conversationalist", "Voice", "Community Leader", "People's Champion"],
    icons: [
      "/images/badges/commentsl1.png",
      "/images/badges/commentsl2.png",
      "/images/badges/commentsl3.png",
      "/images/badges/commentsl4.png",
      "/images/badges/commentsl5.png",
    ],
    unit: "comments",
  },
  {
    id: "media",
    name: "Media & Video Stories Ladder",
    category: "Media",
    thresholds: [3, 10, 30, 75, 150],
    names: ["Photographer", "Story Creator", "Highlight Artist", "Content Pro", "Media Legend"],
    icons: [
      "/images/badges/medial1.png",
      "/images/badges/medial2.png",
      "/images/badges/medial3.png",
      "/images/badges/medial4.png",
      "/images/badges/medial5.png",
    ],
    unit: "media uploads",
  },
  {
    id: "referrals",
    name: "Referrals & Invites Ladder",
    category: "Referrals",
    thresholds: [1, 5, 15, 50, 100],
    names: ["Recruiter", "Squad Builder", "Ambassador", "Community Pioneer", "Clan Master"],
    icons: [
      "/images/badges/referrall1.png",
      "/images/badges/referrall2.png",
      "/images/badges/referrall3.png",
      "/images/badges/referrall4.png",
      "/images/badges/referrall5.png",
    ],
    unit: "friends invited",
  },
];

// ─── GET /api/admin/gamification/thresholds — List feature badge ladders ───
export async function GET() {
  try {
    const laddersMap = new Map<string, FeatureThresholdItem>();

    // 1. Initialize with all default feature ladders
    for (const def of DEFAULT_FEATURE_LADDERS) {
      laddersMap.set(def.id, { ...def });
    }

    // 2. Overlay Firestore featureThresholds
    if (db) {
      try {
        const snap = await db.collection(getFirestoreCollection("featureThresholds")).get();
        if (!snap.empty) {
          snap.docs.forEach((doc) => {
            const data = doc.data();
            const existing = laddersMap.get(doc.id);
            laddersMap.set(doc.id, {
              id: doc.id,
              name: data.name || existing?.name || doc.id,
              category: (data.category || existing?.category || "Custom") as FeatureThresholdItem["category"],
              thresholds: Array.isArray(data.thresholds) ? data.thresholds.map(Number) : (existing?.thresholds || [1, 5, 15, 50, 100]),
              names: Array.isArray(data.names) ? data.names.map(String) : (existing?.names || ["L1", "L2", "L3", "L4", "L5"]),
              icons: Array.isArray(data.icons) ? data.icons.map(String) : (existing?.icons || []),
              unit: data.unit || existing?.unit || "actions",
              updatedAt: data.updatedAt || 0,
            });
          });
        }
      } catch (fsErr) {
        console.warn("[Gamification Thresholds GET] Firestore notice:", fsErr);
      }
    }

    // 3. Overlay DynamoDB saved ladders (highest priority)
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLES.GamificationAndWallet,
          KeyConditionExpression: "userId = :uid AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":uid": "CONFIG#THRESHOLDS",
            ":skPrefix": "THRESHOLD#",
          },
        })
      );
      if (res.Items && res.Items.length > 0) {
        res.Items.forEach((item: any) => {
          const id = item.id || (item.sk ? item.sk.replace(/^THRESHOLD#/i, "") : "");
          if (!id) return;
          const existing = laddersMap.get(id);
          laddersMap.set(id, {
            id,
            name: item.name || existing?.name || id,
            category: (item.category || existing?.category || "Custom") as FeatureThresholdItem["category"],
            thresholds: Array.isArray(item.thresholds) ? item.thresholds.map(Number) : (existing?.thresholds || [1, 5, 15, 50, 100]),
            names: Array.isArray(item.names) ? item.names.map(String) : (existing?.names || ["L1", "L2", "L3", "L4", "L5"]),
            icons: Array.isArray(item.icons) ? item.icons.map(String) : (existing?.icons || []),
            unit: item.unit || existing?.unit || "actions",
            updatedAt: item.updatedAt || 0,
          });
        });
      }
    } catch (dynErr) {
      console.warn("[Gamification Thresholds GET] DynamoDB notice:", dynErr);
    }

    const ladders = Array.from(laddersMap.values());
    return NextResponse.json({ success: true, ladders, totalCount: ladders.length });
  } catch (error) {
    console.error("[GET /api/admin/gamification/thresholds] error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch badge thresholds" }, { status: 500 });
  }
}

// ─── POST /api/admin/gamification/thresholds — Update a badge ladder ───────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || "").trim();
    const name = String(body.name || id).trim();
    const category = body.category || "Custom";
    const thresholds = Array.isArray(body.thresholds) ? body.thresholds.map((n: any) => Math.max(1, parseInt(n, 10) || 1)) : [];
    const names = Array.isArray(body.names) ? body.names.map((s: any) => String(s).trim()) : [];
    const icons = Array.isArray(body.icons) ? body.icons.map((s: any) => String(s).trim()) : [];
    const unit = String(body.unit || "actions").trim();
    const now = Date.now();

    if (!id) {
      return NextResponse.json({ success: false, error: "Feature ID is required" }, { status: 400 });
    }

    if (thresholds.length === 0 || names.length === 0) {
      return NextResponse.json({ success: false, error: "Thresholds and Level Names cannot be empty" }, { status: 400 });
    }

    if (thresholds.length !== names.length) {
      return NextResponse.json({ success: false, error: "Threshold count must match Badge Name count" }, { status: 400 });
    }

    const ladderItem: FeatureThresholdItem = {
      id,
      name,
      category,
      thresholds,
      names,
      icons: icons.length > 0 ? icons : undefined,
      unit,
      updatedAt: now,
    };

    // 1. Save to DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.GamificationAndWallet,
          Item: {
            userId: "CONFIG#THRESHOLDS",
            sk: `THRESHOLD#${id}`,
            entityId: `THRESHOLD#${id}`,
            ...ladderItem,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Gamification Thresholds POST] DynamoDB write notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("featureThresholds")).doc(id).set(ladderItem, { merge: true });
      } catch (fsErr) {
        console.warn("[Gamification Thresholds POST] Firestore write notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, ladder: ladderItem });
  } catch (error) {
    console.error("[POST /api/admin/gamification/thresholds] error:", error);
    return NextResponse.json({ success: false, error: "Failed to update badge ladder" }, { status: 500 });
  }
}
