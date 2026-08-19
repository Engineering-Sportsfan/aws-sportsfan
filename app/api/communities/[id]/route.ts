// app/api/communities/[communityId]/route.ts — BACKEND
// Single community retrieval & updates (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const normalizeId = (id: string) =>
  id.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");

async function getUser(req: NextRequest) {
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return {
          userId: normalizeId(userId),
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
      }
    } catch {}
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(bearerToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return {
          userId: normalizeId(userId),
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
      }
    } catch {}
  }

  return null;
}

function getCommunityIdFromUrl(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/communities/[communityId]
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    if (!communityId) {
      return NextResponse.json(
        { error: "Community ID is required" },
        { status: 400 },
      );
    }

    let communityData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB First
    try {
      const cRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `COMMUNITY#${communityId}`,
            sk: "COMMUNITY#META",
          },
        }),
      );
      if (cRes.Item) {
        communityData = { id: communityId, ...cRes.Item };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[communities/[id] GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || !communityData) {
      const docRef = db.collection("communities").doc(communityId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return NextResponse.json(
          { error: "Community not found" },
          { status: 404 },
        );
      }
      communityData = { id: doc.id, ...doc.data() };
    }

    // Get groups in this community
    let groups: any[] = [];
    try {
      const gRes = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          KeyConditionExpression:
            "entityId = :comm AND begins_with(sk, :grp)",
          ExpressionAttributeValues: {
            ":comm": `COMMUNITY#${communityId}`,
            ":grp": "GROUP#",
          },
          Limit: 20,
        }),
      );
      if (gRes.Items && gRes.Items.length > 0) {
        groups = gRes.Items.map((item) => ({
          id: item.id || (item.sk as string).replace(/^GROUP#/, ""),
          ...item,
        }));
      }
    } catch {}

    if (groups.length === 0) {
      const groupsSnap = await db
        .collection("groups")
        .where("communityId", "==", communityId)
        .limit(20)
        .get();
      groups = groupsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    return NextResponse.json({
      success: true,
      community: communityData,
      groups,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/communities/[communityId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/communities/[communityId]
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    const body = await req.json();

    if (!communityId) {
      return NextResponse.json(
        { error: "Community ID is required" },
        { status: 400 },
      );
    }

    let communityData: any = null;
    let fetchedFromDynamo = false;

    try {
      const cRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `COMMUNITY#${communityId}`,
            sk: "COMMUNITY#META",
          },
        }),
      );
      if (cRes.Item) {
        communityData = { id: communityId, ...cRes.Item };
        fetchedFromDynamo = true;
      }
    } catch {}

    if (!fetchedFromDynamo || !communityData) {
      const docRef = db.collection("communities").doc(communityId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return NextResponse.json(
          { error: "Community not found" },
          { status: 404 },
        );
      }
      communityData = { id: doc.id, ...doc.data() };
    }

    if (communityData.createdBy !== user.userId) {
      return NextResponse.json(
        { error: "Only community owner can update" },
        { status: 403 },
      );
    }

    const allowedFields = ["name", "description", "avatarUrl"];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) updates[field] = body[field];
    });

    const updatedData = { ...communityData, ...updates };

    // 1. Update DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `COMMUNITY#${communityId}`,
            sk: "COMMUNITY#META",
            ...updatedData,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[communities/[id] PATCH] DynamoDB error:", dynErr);
    }

    // 2. Update Firestore
    try {
      await db.collection("communities").doc(communityId).update(updates);
    } catch (fsErr) {
      console.error("[communities/[id] PATCH] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      community: updatedData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/communities/[communityId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}