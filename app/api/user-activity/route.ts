//api/user-activity/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// export async function GET(req: NextRequest) {
//   const userId = req.nextUrl.searchParams.get("userId");
//   const limit  = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");
  
//   if (!userId) {
//     return NextResponse.json({ success: false, error: "userId required" }, { status: 400 });
//   }

//   try {
//     const snap = await db
//       .collection("users")
//       .doc(userId)
//       .collection("activityLog")
//       .orderBy("createdAt", "desc")
//       .limit(limit)
//       .get();

//     const activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
//     return NextResponse.json({ success: true, activities });
//   } catch (err) {
//     return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
//   }
// }




// export async function GET(req: NextRequest) {
//   const userId = req.nextUrl.searchParams.get("userId");
//   const limit  = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

//   if (!userId) {
//     return NextResponse.json({ success: false, error: "userId required" }, { status: 400 });
//   }

//   try {
//     const userRef = db.collection("users").doc(userId);

//     const [activitySnap, userSnap] = await Promise.all([
//       userRef
//         .collection("activityLog")
//         .orderBy("createdAt", "desc")
//         .limit(limit)
//         .get(),
//       userRef.get(),
//     ]);

//     const activities = activitySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
//     const counts = userSnap.exists ? (userSnap.data()?.activityCounts ?? {}) : {};

//     return NextResponse.json({ success: true, activities, counts });
//   } catch (err) {
//     return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
//   }
// }



export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const limit  = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  if (!userId) {
    return NextResponse.json({ success: false, error: "userId required" }, { status: 400 });
  }

  try {
    const userRef = db.collection("users").doc(userId);

    const [activitySnap, userSnap] = await Promise.all([
      userRef
        .collection("activityLog")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get(),
      userRef.get(),
    ]);

    const activities = activitySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // activityCounts is legacy/dead (never written by awardUserPoints — see
    // lib/userPoints.ts). featureStats is the live source; fall back to
    // activityCounts only for reasons that predate the featureStats fix, so
    // old counts don't visibly regress to 0.
    const userData = userSnap.exists ? userSnap.data() ?? {} : {};
    const liveFeatureStats = userData.featureStats ?? {};
    const legacyActivityCounts = userData.activityCounts ?? {};

    const counts: Record<string, number> = {
      ROAR_POST: liveFeatureStats.post ?? legacyActivityCounts.ROAR_POST ?? 0,
      ROAR_DEBATE: liveFeatureStats.debate ?? legacyActivityCounts.ROAR_DEBATE ?? 0,
      ROAR_PREDICTION: liveFeatureStats.predictions ?? legacyActivityCounts.ROAR_PREDICTION ?? 0,
      ROAR_DEBATE_PARTICIPATE: liveFeatureStats.debate_participate ?? legacyActivityCounts.ROAR_DEBATE_PARTICIPATE ?? 0,
      ROAR_PREDICTION_PARTICIPATE: liveFeatureStats.prediction_participate ?? legacyActivityCounts.ROAR_PREDICTION_PARTICIPATE ?? 0,
      ROAR_QUIZ: liveFeatureStats.trivia ?? legacyActivityCounts.ROAR_QUIZ ?? 0,
      ROAR_TRIVIA_CORRECT: liveFeatureStats.trivia ?? legacyActivityCounts.ROAR_TRIVIA_CORRECT ?? 0,
      ROAR_BATTLE_PARTICIPATE: liveFeatureStats.battles ?? legacyActivityCounts.ROAR_BATTLE_PARTICIPATE ?? 0,
      ROAR_HOT_TAKE: legacyActivityCounts.ROAR_HOT_TAKE ?? 0,
      FLASH_QUIZ: legacyActivityCounts.FLASH_QUIZ ?? 0,
      ROAR_MEMORY: liveFeatureStats.post ?? legacyActivityCounts.ROAR_MEMORY ?? 0,
      ROAR_RAW_REACTIONS: liveFeatureStats.post ?? legacyActivityCounts.ROAR_RAW_REACTIONS ?? 0,
    };

    return NextResponse.json({ success: true, activities, counts });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}