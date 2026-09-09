// app/api/invite-waitlist/route.ts — Stores RSVP Waitlist user registrations in the 'userwaitinglist' DynamoDB table
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient, dynamoClient } from "@/lib/dynamodb";
import { TABLES, getTableName } from "@/lib/tableNames";
import { PutCommand, ScanCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export interface UserWaitingListRecord {
  id: string;
  name: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  phone: string;
  location: string;
  institution?: string;
  university?: string;
  referBy?: string;
  referredBy?: string;
  timestamp: string;
  createdAt: number;
  eventName?: string;
  status?: string;
  userAgent?: string;
}

// Table name resolution
const TABLE_NAME = (TABLES as Record<string, string>)["userwaitinglist"] || "userwaitinglist";

// CORS: the RSVP form is hosted as static HTML on sportsfan360.com, while this
// API route lives on a separate deployment — every response (including the
// preflight) needs these headers or the browser blocks the request.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://sportsfan360.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      fullName,
      email,
      phone,
      phoneNumber,
      location,
      institution,
      university,
      referBy,
      referredBy,
      timestamp,
    } = body || {};

    const resolvedName = (name || fullName || "").toString().trim();
    const resolvedEmail = (email || "").toString().trim().toLowerCase();
    const resolvedPhone = (phone || phoneNumber || "").toString().trim();
    const resolvedLocation = (location || "").toString().trim();
    const resolvedInstitution = (institution || university || "").toString().trim();
    const resolvedReferBy = (referBy || referredBy || "").toString().trim();
    const fillTimestamp = timestamp ? timestamp.toString() : new Date().toISOString();

    if (!resolvedName) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!resolvedEmail || !resolvedEmail.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid Email ID is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!resolvedPhone) {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!resolvedLocation) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const id = randomUUID();
    const now = Date.now();

    const record: UserWaitingListRecord = {
      id,
      name: resolvedName,
      fullName: resolvedName,
      email: resolvedEmail,
      phoneNumber: resolvedPhone,
      phone: resolvedPhone,
      location: resolvedLocation,
      institution: resolvedInstitution || undefined,
      university: resolvedInstitution || undefined,
      referBy: resolvedReferBy || undefined,
      referredBy: resolvedReferBy || undefined,
      timestamp: fillTimestamp,
      createdAt: now,
      eventName: "SportsFan360 Event",
      status: "waitlisted",
      userAgent: req.headers.get("user-agent") || undefined,
    };

    // 1. Primary write to AWS DynamoDB 'userwaitinglist' table
    let dynamoSuccess = false;
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: record,
        })
      );
      dynamoSuccess = true;
      console.log(`✅ [DynamoDB: ${TABLE_NAME}] Successfully saved user: ${resolvedEmail} (${id})`);
    } catch (dynErr: any) {
      console.warn(`⚠️ [DynamoDB: ${TABLE_NAME}] Error writing item:`, dynErr?.name, dynErr?.message || dynErr);

      // If the table doesn't exist yet in AWS DynamoDB, automatically trigger table creation
      if (
        dynErr?.name === "ResourceNotFoundException" ||
        dynErr?.message?.includes("Cannot do operations on a non-existent table") ||
        dynErr?.message?.includes("ResourceNotFoundException")
      ) {
        try {
          console.log(`⚙️ Table "${TABLE_NAME}" not found in AWS DynamoDB. Creating it now...`);
          await dynamoClient.send(
            new CreateTableCommand({
              TableName: TABLE_NAME,
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
              BillingMode: "PAY_PER_REQUEST",
            })
          );
          console.log(`🎉 [DynamoDB] Created table "${TABLE_NAME}" successfully in AWS!`);
        } catch (createErr: any) {
          if (createErr?.name !== "ResourceInUseException") {
            console.error(`❌ [DynamoDB] Failed to create table "${TABLE_NAME}":`, createErr?.message || createErr);
          }
        }
      }

      // Secondary fallback write to IdentityAndAccess
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLES.IdentityAndAccess || "IdentityAndAccess",
            Item: {
              entityId: `WAITLIST#${id}`,
              sk: `USER#${resolvedEmail}`,
              ...record,
            },
          })
        );
        dynamoSuccess = true;
        console.log(`✅ [DynamoDB: IdentityAndAccess] Saved backup record for: ${resolvedEmail}`);
      } catch (fallbackErr) {
        console.warn("⚠️ [DynamoDB fallback] Notice:", fallbackErr);
      }
    }

    // 2. Dual-Write to Firestore ('userwaitinglist' collection) as additional sync/backup
    if (db) {
      try {
        await db.collection("userwaitinglist").doc(id).set(record, { merge: true });
        console.log(`✅ [Firestore: userwaitinglist] Synced doc: ${id}`);
      } catch (fsErr) {
        console.warn("⚠️ [Firestore: userwaitinglist] Notice:", fsErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "User successfully registered on waiting list!",
        user: {
          id,
          name: resolvedName,
          email: resolvedEmail,
          phoneNumber: resolvedPhone,
          location: resolvedLocation,
          institution: resolvedInstitution,
          referBy: resolvedReferBy,
          timestamp: fillTimestamp,
        },
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: unknown) {
    console.error("Error in POST /api/invite-waitlist:", error);
    const message = error instanceof Error ? error.message : "Failed to register user to waiting list";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 500;
    const id = searchParams.get("id");

    // Single user lookup
    if (id) {
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { id },
          })
        );
        if (getRes.Item) {
          return NextResponse.json({
            success: true,
            user: getRes.Item,
          });
        }
      } catch (e) {
        console.warn(`[userwaitinglist GET id] DynamoDB notice:`, e);
      }

      if (db) {
        const doc = await db.collection("userwaitinglist").doc(id).get();
        if (doc.exists) {
          return NextResponse.json({
            success: true,
            user: { id: doc.id, ...doc.data() },
          });
        }
      }

      return NextResponse.json({ success: false, error: "User not found in waiting list" }, { status: 404 });
    }

    // List all users from 'userwaitinglist' (with pagination loop for full directory)
    let users: any[] = [];
    try {
      let ExclusiveStartKey: Record<string, any> | undefined;
      do {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            Limit: Math.min(limit, 250),
            ExclusiveStartKey,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          users.push(...scanRes.Items);
        }
        ExclusiveStartKey = scanRes.LastEvaluatedKey;
        if (users.length >= limit) break;
      } while (ExclusiveStartKey);
    } catch (e) {
      console.warn(`[userwaitinglist GET list] DynamoDB notice:`, e);
    }

    // Fallback to Firestore if needed
    if (users.length === 0 && db) {
      const snap = await db.collection("userwaitinglist").orderBy("createdAt", "desc").limit(limit).get();
      users = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json(
      {
        success: true,
        count: users.length,
        users,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch waiting list";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing record ID" }, { status: 400 });
    }

    // 1. Delete from DynamoDB userwaitinglist
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id },
        })
      );
    } catch (dynErr) {
      console.warn("[invite-waitlist DELETE] DynamoDB notice:", dynErr);
    }

    // 2. Also delete from Firestore if exists
    if (db) {
      try {
        await db.collection("userwaitinglist").doc(id).delete();
      } catch (fsErr) {
        console.warn("[invite-waitlist DELETE] Firestore notice:", fsErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Waitlist record deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete waitlist record";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
