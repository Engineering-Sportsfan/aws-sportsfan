// app/api/records/route.ts — Records & Reports API (AWS DynamoDB `records` table & Firestore DualWrite)
import { NextRequest, NextResponse } from "next/server";
import { docClient, dynamoClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES, getTableName, getFirestoreCollection } from "@/lib/tableNames";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { PutCommand, GetCommand, ScanCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";

export const dynamic = "force-dynamic";

const TABLE_NAME = getTableName("records") || "records";

/** Helper to automatically create the DynamoDB table if it does not exist yet */
async function ensureRecordsTableExists() {
  try {
    await dynamoClient.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      })
    );
    console.log(`🎉 [DynamoDB] Created table "${TABLE_NAME}" successfully in AWS!`);
  } catch (err: any) {
    if (err?.name !== "ResourceInUseException" && !err?.message?.includes("already exists")) {
      console.warn(`[DynamoDB] Table check/creation note for "${TABLE_NAME}":`, err?.message || err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/records — Store a new report / audit record
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      cardId,
      postId,
      cardSk,
      cardContent,
      cardAuthor,
      cardAuthorId,
      cardSport,
      reason,
      tag,
      reportTag,
      reporterId,
      reporterName,
      reporterHandle,
      reporterEmail,
      reporterAvatar,
      recordType = "flipline_report",
      metadata,
    } = body;

    const resolvedCardId = String(cardId || postId || "").trim();
    const resolvedReason = String(reason || "").trim();
    const resolvedTag = String(tag || reportTag || "Other").trim();

    if (!resolvedCardId && !cardSk && !resolvedReason && !resolvedTag) {
      return NextResponse.json(
        { success: false, error: "Report details (cardId, reason or tag) are required." },
        { status: 400 }
      );
    }

    const now = Date.now();
    const id = `rec_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const recordItem = {
      id,
      recordId: id,
      entityId: `RECORD#${id}`,
      sk: `REPORT#${resolvedCardId || "GENERAL"}#${reporterId || "anonymous"}`,
      cardId: resolvedCardId,
      cardSk: cardSk || "",
      cardContent: cardContent || "",
      cardAuthor: cardAuthor || "",
      cardAuthorId: cardAuthorId || "",
      cardSport: cardSport || "general",
      reason: resolvedReason,
      tag: resolvedTag,
      reporterId: reporterId || "anonymous",
      reporterName: reporterName || "Fan",
      reporterHandle: reporterHandle || "@fan",
      reporterEmail: reporterEmail || "",
      reporterAvatar: reporterAvatar || "",
      status: "pending", // pending | reviewed | dismissed | actioned
      recordType,
      metadata: metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    // 1. Primary write to DynamoDB `records` table
    let dynamoSaved = false;
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: recordItem,
        })
      );
      dynamoSaved = true;
      console.log(`✅ [DynamoDB: ${TABLE_NAME}] Successfully saved record ${id}`);
    } catch (dynErr: any) {
      console.warn(`⚠️ [DynamoDB: ${TABLE_NAME}] PutCommand error:`, dynErr?.name, dynErr?.message || dynErr);

      if (
        dynErr?.name === "ResourceNotFoundException" ||
        dynErr?.message?.includes("Cannot do operations on a non-existent table") ||
        dynErr?.message?.includes("ResourceNotFoundException")
      ) {
        await ensureRecordsTableExists();
        try {
          await docClient.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: recordItem,
            })
          );
          dynamoSaved = true;
          console.log(`✅ [DynamoDB: ${TABLE_NAME}] Saved record ${id} after table creation.`);
        } catch (retryErr: any) {
          console.error(`❌ [DynamoDB: ${TABLE_NAME}] Retry failed:`, retryErr?.message || retryErr);
        }
      }
    }

    // 2. Secondary fallback write to SocialAndContent table & Firebase dualWrite
    try {
      const socialAndContentItem = {
        ...recordItem,
        contentId: `RECORD#${id}`,
      };
      await dualWrite("records", id, TABLES.SocialAndContent || "SocialAndContent", socialAndContentItem);
    } catch (dualErr: any) {
      console.warn("⚠️ [DualWrite: records] Notice:", dualErr?.message || dualErr);
    }

    return NextResponse.json(
      {
        success: true,
        data: recordItem,
        message: "Report record successfully saved.",
      },
      { status: 201 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error saving record";
    console.error("POST /api/records error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/records — Retrieve records / reports
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const cardId = searchParams.get("cardId") || searchParams.get("postId");
    const reporterId = searchParams.get("reporterId");
    const recordType = searchParams.get("recordType");
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 200);

    // 1. If fetching by specific ID
    if (id) {
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { id },
          })
        );
        if (getRes.Item) {
          return NextResponse.json({ success: true, data: getRes.Item });
        }
      } catch (err) {
        console.warn(`[records GET id] DynamoDB notice:`, err);
      }

      // Fallback to Firestore
      if (db) {
        const docSnap = await db.collection(getFirestoreCollection("records")).doc(id).get();
        if (docSnap.exists) {
          return NextResponse.json({ success: true, data: { id: docSnap.id, ...docSnap.data() } });
        }
      }

      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 });
    }

    // 2. Scan DynamoDB records table
    let records: any[] = [];
    try {
      let filterExpressions: string[] = [];
      const exprValues: Record<string, any> = {};
      const exprNames: Record<string, string> = {};

      if (cardId) {
        filterExpressions.push("cardId = :cardId");
        exprValues[":cardId"] = cardId;
      }
      if (reporterId) {
        filterExpressions.push("reporterId = :reporterId");
        exprValues[":reporterId"] = reporterId;
      }
      if (recordType) {
        filterExpressions.push("recordType = :recordType");
        exprValues[":recordType"] = recordType;
      }
      if (status) {
        filterExpressions.push("#st = :status");
        exprValues[":status"] = status;
        exprNames["#st"] = "status";
      }

      const scanParams: any = {
        TableName: TABLE_NAME,
        Limit: limit,
      };

      if (filterExpressions.length > 0) {
        scanParams.FilterExpression = filterExpressions.join(" AND ");
        scanParams.ExpressionAttributeValues = exprValues;
        if (Object.keys(exprNames).length > 0) {
          scanParams.ExpressionAttributeNames = exprNames;
        }
      }

      const scanRes = await docClient.send(new ScanCommand(scanParams));
      if (scanRes.Items && scanRes.Items.length > 0) {
        records = scanRes.Items;
      }
    } catch (e: any) {
      console.warn("[records GET scan] DynamoDB notice:", e?.message || e);
    }

    // 3. Fallback to SocialAndContent table scan if empty
    if (records.length === 0) {
      try {
        const fallbackScan = await docClient.send(
          new ScanCommand({
            TableName: TABLES.SocialAndContent || "SocialAndContent",
            FilterExpression: "begins_with(contentId, :prefix)",
            ExpressionAttributeValues: { ":prefix": "RECORD#" },
            Limit: limit,
          })
        );
        if (fallbackScan.Items && fallbackScan.Items.length > 0) {
          records = fallbackScan.Items.map((item) => ({
            id: item.id || (item.contentId as string).replace(/^RECORD#/, ""),
            ...item,
          }));
        }
      } catch (fbErr) {
        console.warn("[records GET fallback scan] notice:", fbErr);
      }
    }

    // 4. Fallback to Firestore if still empty
    if (records.length === 0 && db) {
      let query = db.collection(getFirestoreCollection("records")).orderBy("createdAt", "desc") as FirebaseFirestore.Query;
      if (cardId) query = query.where("cardId", "==", cardId);
      if (reporterId) query = query.where("reporterId", "==", reporterId);
      if (status) query = query.where("status", "==", status);

      const snapshot = await query.limit(limit).get();
      records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    // Sort by createdAt desc
    records.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

    return NextResponse.json({
      success: true,
      records,
      total: records.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error fetching records";
    console.error("GET /api/records error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/records — Update record status / resolution notes
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, adminId, adminNote } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Record id and status are required." },
        { status: 400 }
      );
    }

    const now = Date.now();
    const updateData: Record<string, any> = {
      status,
      updatedAt: now,
    };
    if (adminId) updateData.resolvedBy = adminId;
    if (adminNote) updateData.adminNote = adminNote;
    if (status === "reviewed" || status === "actioned" || status === "dismissed") {
      updateData.resolvedAt = now;
    }

    // 1. Update DynamoDB records table
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id },
          UpdateExpression: "SET #st = :status, updatedAt = :updatedAt, resolvedBy = :adminId, adminNote = :adminNote",
          ExpressionAttributeNames: { "#st": "status" },
          ExpressionAttributeValues: {
            ":status": status,
            ":updatedAt": now,
            ":adminId": adminId || null,
            ":adminNote": adminNote || null,
          },
        })
      );
    } catch (dynErr) {
      console.warn(`[records PATCH] DynamoDB update notice:`, dynErr);
    }

    // 2. Dual-update Firestore
    if (db) {
      await db.collection(getFirestoreCollection("records")).doc(id).set(updateData, { merge: true });
    }

    return NextResponse.json({
      success: true,
      message: `Record ${id} updated successfully.`,
      data: { id, ...updateData },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error updating record";
    console.error("PATCH /api/records error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/records — Delete a record
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Record id is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id },
        })
      );
    } catch (dynErr) {
      console.warn(`[records DELETE] DynamoDB delete notice:`, dynErr);
    }

    // 2. Dual-delete from Firestore
    try {
      await dualDelete("records", id, TABLE_NAME, { id });
    } catch (dualErr) {
      console.warn(`[records DELETE] Dual-delete notice:`, dualErr);
    }

    return NextResponse.json({
      success: true,
      message: `Record ${id} deleted successfully.`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error deleting record";
    console.error("DELETE /api/records error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
