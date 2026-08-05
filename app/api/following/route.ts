import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

interface FollowingRecord {
  userId: string;
  userEmail: string;
  followingplayername: string;
  createdAt: number;
  updatedAt: number;
}

const COLLECTION = "following";

function buildFollowDocId(userId: string, followingPlayerName: string) {
  return `${encodeURIComponent(userId)}_${encodeURIComponent(
    followingPlayerName.toLowerCase(),
  )}`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const userEmail = searchParams.get("userEmail");

    let following: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB
    try {
      if (userId) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "IdentityAndAccess",
            KeyConditionExpression:
              "entityId = :uid AND begins_with(sk, :fol)",
            ExpressionAttributeValues: {
              ":uid": `USER#${userId}`,
              ":fol": "FOLLOWING#",
            },
          }),
        );
        if (qRes.Items && qRes.Items.length > 0) {
          following = qRes.Items.map((item) => ({
            id: buildFollowDocId(item.userId, item.followingplayername),
            ...item,
          }));
          fetchedFromDynamo = true;
        }
      } else {
        const sRes = await docClient.send(
          new ScanCommand({
            TableName: "IdentityAndAccess",
            FilterExpression: "begins_with(sk, :fol)",
            ExpressionAttributeValues: {
              ":fol": "FOLLOWING#",
            },
          }),
        );
        if (sRes.Items && sRes.Items.length > 0) {
          let items: any[] = sRes.Items.map((item: any) => ({
            id: buildFollowDocId(item.userId, item.followingplayername),
            ...item,
          }));
          if (userEmail) {
            items = items.filter((i: any) => i.userEmail === userEmail);
          }
          items.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
          following = items;
          fetchedFromDynamo = true;
        }
      }
    } catch (dynErr) {
      console.warn("[following GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      if (!userId && !userEmail) {
        const snapshot = await db
          .collection(COLLECTION)
          .orderBy("createdAt", "desc")
          .get();
        following = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } else {
        let query: FirebaseFirestore.Query = db.collection(COLLECTION);
        if (userId) query = query.where("userId", "==", userId);
        if (userEmail) query = query.where("userEmail", "==", userEmail);

        const snapshot = await query.get();
        following = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      }
    }

    return NextResponse.json({
      success: true,
      following,
      total: following.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching following records:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const userId = normalizeText(body.userId);
    const userEmail = normalizeText(body.userEmail);
    const followingplayername = normalizeText(body.followingplayername);

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    if (!userEmail) {
      return NextResponse.json(
        { error: "userEmail is required" },
        { status: 400 },
      );
    }

    if (!followingplayername) {
      return NextResponse.json(
        { error: "followingplayername is required" },
        { status: 400 },
      );
    }

    const docId = buildFollowDocId(userId, followingplayername);
    const playerKey = followingplayername.toLowerCase();

    // Check if existing in DynamoDB
    let existingItem: any = null;
    try {
      const gRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${userId}`, sk: `FOLLOWING#${playerKey}` },
        }),
      );
      if (gRes.Item) existingItem = gRes.Item;
    } catch {}

    if (!existingItem) {
      const docRef = db.collection(COLLECTION).doc(docId);
      const existingDoc = await docRef.get();
      if (existingDoc.exists) existingItem = existingDoc.data();
    }

    if (existingItem) {
      return NextResponse.json(
        {
          error: "This player is already being followed by this user.",
          following: { id: docId, ...existingItem },
        },
        { status: 409 },
      );
    }

    const now = Date.now();
    const newFollowing: FollowingRecord = {
      userId,
      userEmail,
      followingplayername,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `USER#${userId}`,
            sk: `FOLLOWING#${playerKey}`,
            ...newFollowing,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[following POST] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      await db.collection(COLLECTION).doc(docId).set(newFollowing);
    } catch (fsErr) {
      console.error("[following POST] Firestore error:", fsErr);
    }

    return NextResponse.json(
      {
        success: true,
        following: { id: docId, ...newFollowing },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating following record:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let userId = searchParams.get("userId") || undefined;
    let followingplayername =
      searchParams.get("followingplayername") || undefined;

    if (!userId || !followingplayername) {
      const body = await req.json().catch(() => ({}));
      userId = userId || normalizeText(body.userId);
      followingplayername =
        followingplayername || normalizeText(body.followingplayername);
    }

    if (!userId || !followingplayername) {
      return NextResponse.json(
        { error: "userId and followingplayername are required to unfollow" },
        { status: 400 },
      );
    }

    const docId = buildFollowDocId(userId, followingplayername);
    const playerKey = followingplayername.toLowerCase();

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${userId}`, sk: `FOLLOWING#${playerKey}` },
        }),
      );
    } catch (dynErr) {
      console.error("[following DELETE] DynamoDB error:", dynErr);
    }

    // 2. Delete from Firestore
    try {
      await db.collection(COLLECTION).doc(docId).delete();
    } catch (fsErr) {
      console.error("[following DELETE] Firestore error:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting following record:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}