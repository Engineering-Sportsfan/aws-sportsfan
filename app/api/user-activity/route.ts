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
    const counts = userSnap.exists ? (userSnap.data()?.activityCounts ?? {}) : {};

    return NextResponse.json({ success: true, activities, counts });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}