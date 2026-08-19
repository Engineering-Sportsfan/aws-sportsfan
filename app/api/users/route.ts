// app/api/users/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand, UpdateCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Scan DynamoDB IdentityAndAccess for User entities
    const scanRes = await docClient.send(
      new ScanCommand({
        TableName: "IdentityAndAccess",
        FilterExpression: "begins_with(entityId, :prefix) OR attribute_exists(email)",
        ExpressionAttributeValues: {
          ":prefix": "USER#",
        },
      })
    );

    let users: Array<Record<string, unknown>> = [];

    if (scanRes.Items && scanRes.Items.length > 0) {
      users = scanRes.Items.map((item) => {
        const rawEmail = item.email || (item.entityId as string)?.replace(/^USER#/, "") || "";
        return {
          email: rawEmail,
          ...item,
          status: item.status ?? "active",
          role: item.role ?? "user",
        };
      });
    } else {
      // Fallback to Firebase if DynamoDB returns empty
      const snap = await db.collection("users").orderBy("createdAt", "desc").get();
      users = snap.docs.map((d) => ({
        email: d.id,
        ...d.data(),
        status: d.data().status ?? "active",
        role: d.data().role ?? "user",
      }));
    }

    return NextResponse.json({ users, total: users.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("GET /api/users error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch users";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { email, status, role } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const now = Date.now();

    // 1. Update in DynamoDB (IdentityAndAccess)
    const updateExpressions: string[] = ["#updatedAt = :updatedAt"];
    const exprAttrNames: Record<string, string> = { "#updatedAt": "updatedAt" };
    const exprAttrValues: Record<string, unknown> = { ":updatedAt": now };

    if (status !== undefined) {
      updateExpressions.push("#status = :status");
      exprAttrNames["#status"] = "status";
      exprAttrValues[":status"] = status;
    }
    if (role !== undefined) {
      updateExpressions.push("#role = :role");
      exprAttrNames["#role"] = "role";
      exprAttrValues[":role"] = role;
    }

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `USER#${email}`,
            sk: "USER#META",
          },
          UpdateExpression: `SET ${updateExpressions.join(", ")}`,
          ExpressionAttributeNames: exprAttrNames,
          ExpressionAttributeValues: exprAttrValues,
        })
      );
    } catch (dynamoErr) {
      console.warn("DynamoDB PATCH user update notice:", dynamoErr);
    }

    // 2. Dual-Write Sync to Firebase
    try {
      await db.collection("users").doc(email).set(
        {
          ...(status !== undefined && { status }),
          ...(role !== undefined && { role }),
          updatedAt: now,
        },
        { merge: true }
      );
    } catch (fbErr) {
      console.warn("Firebase PATCH user sync notice:", fbErr);
    }

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("PATCH /api/users error:", error);
    const msg = error instanceof Error ? error.message : "Failed to update user";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB (IdentityAndAccess)
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `USER#${email}`,
            sk: "USER#META",
          },
        })
      );
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `OTP#${email}`,
            sk: "OTP#ACTIVE",
          },
        })
      );
    } catch (dynamoErr) {
      console.warn("DynamoDB user delete notice:", dynamoErr);
    }

    // 2. Dual-Delete Sync to Firebase
    try {
      await db.collection("users").doc(email).delete();
      await db.collection("otps").doc(email).delete();
    } catch (fbErr) {
      console.warn("Firebase user delete notice:", fbErr);
    }

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/users error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}