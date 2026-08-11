// app/api/player-profile/home/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const playerProfilesId = searchParams.get("playerProfilesId");
    const rawSearch = searchParams.get("search")?.trim() || "";
    const limit = parseInt(searchParams.get("limit") || "20");

    let posts: any[] = [];

    // 1. Try DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :hPrefix)";
      const exprVals: Record<string, any> = {
        ":hPrefix": "PLAYER_HOME#",
      };

      if (playerProfilesId) {
        filterExpr += " AND playerProfilesId = :ppId";
        exprVals[":ppId"] = playerProfilesId;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          Limit: 200,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        posts = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^PLAYER_HOME#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[player-profile home GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (posts.length === 0 && db) {
      if (action === "count") {
        const collectionRef = db.collection("playershome");
        let query: FirebaseFirestore.Query = collectionRef;
        if (playerProfilesId) {
          query = query.where("playerProfilesId", "==", playerProfilesId);
        }
        const snapshot = await query.count().get();
        return NextResponse.json({
          success: true,
          totalCount: snapshot.data().count,
          filtered: !!playerProfilesId,
          filter: playerProfilesId || null,
        });
      }

      let query = db.collection("playershome").orderBy("createdAt", "desc");
      if (playerProfilesId) {
        query = query.where("playerProfilesId", "==", playerProfilesId);
      }
      query = query.limit(limit);
      const snap = await query.get();
      posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    if (rawSearch) {
      const searchLower = rawSearch.toLowerCase();
      posts = posts.filter((p) => {
        const name = (p.playerName || "").toLowerCase();
        const title = (p.title || "").toLowerCase();
        return name.includes(searchLower) || title.includes(searchLower);
      });
    }

    posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paged = posts.slice(0, limit);

    return NextResponse.json({
      success: true,
      posts: paged,
      pagination: {
        limit,
        hasMore: posts.length > limit,
        nextCursor: null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Fetch error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST: Create new post linked to player ───────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      playerProfilesId,
      playerName,
      title,
      category,
      likes,
      comments,
      live,
      shares,
      image,
      logo,
      catlogo,
      hasVideo,
    } = body;

    const now = Date.now();
    const id = `phome_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newPost = {
      id,
      playerProfilesId,
      playerName,
      playerNameLower: playerName?.trim().toLowerCase() || "",
      title,
      category: category ?? [],
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      live: Number(live) || 0,
      shares: Number(shares) || 0,
      image,
      logo,
      catlogo: catlogo ?? [],
      hasVideo: hasVideo ?? false,
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `PLAYER_HOME#${id}`,
        sk: `HOME#${now}`,
        ...newPost,
      },
      firestoreRef: db.collection("playershome").doc(id),
      firestoreData: newPost,
    });

    return NextResponse.json(
      {
        success: true,
        id,
        post: newPost,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}