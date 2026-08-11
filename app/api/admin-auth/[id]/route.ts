// app/api/admin-auth/[id]/route.ts — Migrated to AWS DynamoDB (UserData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const email = decodeURIComponent(id);
    const body = await req.json();
    
    const { status, roles, departmentId, phone } = body;

    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "UserData",
          Key: { userId: `ADMIN_USER#${email}`, sk: "PROFILE#META" },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch {}

    if (!existing && db) {
      const adminDoc = await db.collection("admin_users").doc(email).get();
      if (adminDoc.exists) existing = adminDoc.data();
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, any> = { updatedAt: Date.now() };
    if (status !== undefined) updateData.status = status;
    if (roles !== undefined) updateData.roles = roles;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (phone !== undefined) updateData.phone = phone;

    const updatedDoc = {
      ...existing,
      ...updateData,
      email,
    };

    await dualWrite({
      tableName: "UserData",
      dynamoItem: {
        userId: `ADMIN_USER#${email}`,
        sk: "PROFILE#META",
        ...updatedDoc,
      },
      firestoreRef: db.collection("admin_users").doc(email),
      firestoreData: updateData,
    });

    return NextResponse.json({ success: true, message: "User updated successfully", user: updatedDoc });

  } catch (error: unknown) {
    console.error("ADMIN USERS PATCH ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const email = decodeURIComponent(id);

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "UserData",
          Key: { userId: `ADMIN_USER#${email}`, sk: "PROFILE#META" },
        })
      );
    } catch (e) {
      console.warn("[admin-auth [id] DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const adminRef = db.collection("admin_users").doc(email);
      const adminDoc = await adminRef.get();
      if (adminDoc.exists) {
        await adminRef.delete();
      }
    }

    return NextResponse.json({
      success: true,
      message: "Admin user deleted successfully",
    });

  } catch (error: unknown) {
    console.error("ADMIN USERS DELETE ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
