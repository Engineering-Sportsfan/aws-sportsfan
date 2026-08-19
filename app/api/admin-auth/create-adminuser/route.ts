// app/api/admin-auth/create-adminuser/route.ts — Migrated to AWS DynamoDB (UserData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let users: any[] = [];

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :auPrefix) AND sk = :pSk",
          ExpressionAttributeValues: {
            ":auPrefix": "ADMIN#",
            ":pSk": "ADMIN#META",
          },
          Limit: 50,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        users = scanRes.Items.map((d) => ({
          email: d.email || (d.entityId as string).replace(/^ADMIN#/, ""),
          ...d,
        }));
      }
    } catch (e) {
      console.warn("[admin-auth create-adminuser GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (users.length === 0 && db) {
      const snap = await db.collection("admin_users").orderBy("createdAt", "desc").get();
      users = snap.docs.map(d => ({
        email: d.id,
        ...d.data(),
      }));
    }

    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ users, total: users.length });
  } catch (error: unknown) {
    console.error("ADMIN USERS GET ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, firstName, lastName, phone, employeeId, departmentId, roles } = body;

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Missing required fields (email, firstName, lastName)" },
        { status: 400 }
      );
    }

    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `ADMIN#${email.toLowerCase()}`, sk: "ADMIN#META" },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch {}

    if (!existing && db) {
      const adminDoc = await db.collection("admin_users").doc(email).get();
      if (adminDoc.exists) existing = adminDoc.data();
    }

    if (existing) {
      return NextResponse.json(
        { error: "Admin user already exists with this email" },
        { status: 409 }
      );
    }

    // Generate a secure temporary password
    const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(generatedPassword, 12);

    const now = Date.now();
    const newAdminData = {
      email,
      firstName,
      lastName,
      phone: phone || null,
      employeeId: employeeId || null,
      departmentId: departmentId || null,
      password: hashedPassword,
      isFirstLogin: true,
      roles: roles || ["sf360Staff"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await dualWrite({
      tableName: "IdentityAndAccess",
      dynamoItem: {
        entityId: `ADMIN#${email.toLowerCase()}`,
        sk: "ADMIN#META",
        ...newAdminData,
      },
      firestoreRef: db.collection("admin_users").doc(email),
      firestoreData: newAdminData,
    });

    const { password: _, ...safeAdminData } = newAdminData;

    return NextResponse.json({
      success: true,
      user: safeAdminData,
      generatedPassword: generatedPassword,
    }, { status: 201 });

  } catch (error: unknown) {
    console.error("ADMIN USERS POST ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
