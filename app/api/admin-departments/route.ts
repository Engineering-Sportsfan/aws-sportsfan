// app/api/admin-departments/route.ts — Migrated to AWS DynamoDB (UserData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let departments: any[] = [];

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "UserData",
          FilterExpression: "begins_with(userId, :dPrefix) AND sk = :dSk",
          ExpressionAttributeValues: {
            ":dPrefix": "ADMIN#DEPARTMENT#",
            ":dSk": "DEPT#META",
          },
          Limit: 50,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        departments = scanRes.Items.map((d) => ({
          id: d.id || (d.userId as string).replace(/^ADMIN#DEPARTMENT#/, ""),
          ...d,
        }));
      }
    } catch (e) {
      console.warn("[admin-departments GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (departments.length === 0 && db) {
      const snap = await db.collection("departments").orderBy("createdAt", "desc").get();
      departments = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
    }

    departments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ departments, total: departments.length });
  } catch (error: unknown) {
    console.error("ADMIN DEPARTMENTS GET ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, departmentHeadId, description, isActive } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Department name is required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const id = `dept_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newDeptData = {
      id,
      name,
      departmentHeadId: departmentHeadId || null,
      description: description || "",
      isActive: isActive !== undefined ? isActive : true,
      createdAt: now,
      updatedAt: now,
    };

    await dualWrite({
      tableName: "UserData",
      dynamoItem: {
        userId: `ADMIN#DEPARTMENT#${id}`,
        sk: "DEPT#META",
        ...newDeptData,
      },
      firestoreRef: db.collection("departments").doc(id),
      firestoreData: newDeptData,
    });

    return NextResponse.json({
      success: true,
      department: newDeptData
    }, { status: 201 });

  } catch (error: unknown) {
    console.error("ADMIN DEPARTMENTS POST ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
