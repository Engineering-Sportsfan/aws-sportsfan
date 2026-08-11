// app/api/admin-departments/[id]/route.ts — Migrated to AWS DynamoDB (UserData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    const { name, departmentHeadId, description, isActive } = body;

    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "UserData",
          Key: { userId: `ADMIN#DEPARTMENT#${id}`, sk: "DEPT#META" },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch {}

    if (!existing && db) {
      const deptDoc = await db.collection("departments").doc(id).get();
      if (deptDoc.exists) existing = deptDoc.data();
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, any> = { updatedAt: Date.now() };
    if (name !== undefined) updateData.name = name;
    if (departmentHeadId !== undefined) updateData.departmentHeadId = departmentHeadId;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedDoc = {
      ...existing,
      ...updateData,
      id,
    };

    await dualWrite({
      tableName: "UserData",
      dynamoItem: {
        userId: `ADMIN#DEPARTMENT#${id}`,
        sk: "DEPT#META",
        ...updatedDoc,
      },
      firestoreRef: db.collection("departments").doc(id),
      firestoreData: updateData,
    });

    return NextResponse.json({ success: true, message: "Department updated successfully", department: updatedDoc });

  } catch (error: unknown) {
    console.error("ADMIN DEPARTMENTS PATCH ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "UserData",
          Key: { userId: `ADMIN#DEPARTMENT#${id}`, sk: "DEPT#META" },
        })
      );
    } catch (e) {
      console.warn("[admin-departments DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const deptRef = db.collection("departments").doc(id);
      const deptDoc = await deptRef.get();
      if (deptDoc.exists) {
        await deptRef.delete();
      }
    }

    return NextResponse.json({
      success: true,
      message: "Department deleted successfully",
    });

  } catch (error: unknown) {
    console.error("ADMIN DEPARTMENTS DELETE ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
