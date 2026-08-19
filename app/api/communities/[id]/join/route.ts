// app/api/communities/[communityId]/join/route.ts — BACKEND
// Join and leave community membership (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
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
  return parts[parts.length - 2];
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/communities/[communityId]/join
// Join a community
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    let communityData: any = null;

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
      if (cRes.Item) communityData = cRes.Item;
    } catch {}

    if (!communityData) {
      const communityDoc = await db
        .collection("communities")
        .doc(communityId)
        .get();
      if (!communityDoc.exists) {
        return NextResponse.json(
          { error: "Community not found" },
          { status: 404 },
        );
      }
      communityData = { id: communityDoc.id, ...communityDoc.data() };
    }

    // Check if already a member
    let isAlreadyMember = false;
    try {
      const mRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `COMMUNITY#${communityId}`,
            sk: `MEMBER#${user.userId}`,
          },
        }),
      );
      if (mRes.Item) isAlreadyMember = true;
    } catch {}

    if (!isAlreadyMember) {
      const memberDoc = await db
        .collection("communities")
        .doc(communityId)
        .collection("communityMembers")
        .doc(user.userId)
        .get();
      if (memberDoc.exists) isAlreadyMember = true;
    }

    if (isAlreadyMember) {
      return NextResponse.json(
        { error: "Already a member of this community" },
        { status: 409 },
      );
    }

    const now = Date.now();
    const newMemberCount = (communityData.memberCount || 0) + 1;
    const memberItem = {
      communityId,
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: "member",
      joinedAt: now,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `COMMUNITY#${communityId}`,
            sk: `MEMBER#${user.userId}`,
            ...memberItem,
          },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `USER#${user.userId}`,
            sk: `COMMUNITY#${communityId}`,
            ...memberItem,
          },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...communityData,
            entityId: `COMMUNITY#${communityId}`,
            sk: "COMMUNITY#META",
            memberCount: newMemberCount,
            updatedAt: now,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[community join POST] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      const batch = db.batch();
      const communityRef = db.collection("communities").doc(communityId);
      const memberRef = communityRef
        .collection("communityMembers")
        .doc(user.userId);

      batch.set(memberRef, memberItem);
      batch.update(communityRef, {
        memberCount: FieldValue.increment(1),
        updatedAt: now,
      });
      await batch.commit();
    } catch (fsErr) {
      console.error("[community join POST] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      status: "joined",
      message: "Joined community successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/communities/[communityId]/join error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/communities/[communityId]/join
// Leave a community
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    let communityData: any = null;

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
      if (cRes.Item) communityData = cRes.Item;
    } catch {}

    if (!communityData) {
      const communityDoc = await db
        .collection("communities")
        .doc(communityId)
        .get();
      if (!communityDoc.exists) {
        return NextResponse.json(
          { error: "Community not found" },
          { status: 404 },
        );
      }
      communityData = { id: communityDoc.id, ...communityDoc.data() };
    }

    let memberData: any = null;
    try {
      const mRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `COMMUNITY#${communityId}`,
            sk: `MEMBER#${user.userId}`,
          },
        }),
      );
      if (mRes.Item) memberData = mRes.Item;
    } catch {}

    if (!memberData) {
      const memberDoc = await db
        .collection("communities")
        .doc(communityId)
        .collection("communityMembers")
        .doc(user.userId)
        .get();
      if (memberDoc.exists) memberData = memberDoc.data();
    }

    if (!memberData) {
      return NextResponse.json(
        { error: "You are not a member" },
        { status: 400 },
      );
    }

    if (memberData.role === "owner") {
      return NextResponse.json(
        { error: "Community owner cannot leave. Delete the community instead." },
        { status: 400 },
      );
    }

    const now = Date.now();
    const newMemberCount = Math.max(0, (communityData.memberCount || 1) - 1);

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `COMMUNITY#${communityId}`,
            sk: `MEMBER#${user.userId}`,
          },
        }),
      );

      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `USER#${user.userId}`,
            sk: `COMMUNITY#${communityId}`,
          },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...communityData,
            entityId: `COMMUNITY#${communityId}`,
            sk: "COMMUNITY#META",
            memberCount: newMemberCount,
            updatedAt: now,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[community join DELETE] DynamoDB error:", dynErr);
    }

    // 2. Delete from Firestore
    try {
      const batch = db.batch();
      const communityRef = db.collection("communities").doc(communityId);
      const memberRef = communityRef
        .collection("communityMembers")
        .doc(user.userId);

      batch.delete(memberRef);
      batch.update(communityRef, {
        memberCount: FieldValue.increment(-1),
        updatedAt: now,
      });
      await batch.commit();
    } catch (fsErr) {
      console.error("[community join DELETE] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Left community successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/communities/[communityId]/join error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}