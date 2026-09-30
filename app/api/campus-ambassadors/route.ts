// app/api/campus-ambassadors/route.ts — Campus Ambassadors API with DynamoDB & Firestore Dual-Write
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const COLLECTION_NAME = "campusAmbassadors";
const ROOM_ID = "CAMPUS#AMBASSADORS";

export interface CampusAmbassador {
  id: string;
  campusName: string;
  campusSlug: string;
  userId: string;
  userName: string;
  userEmail: string;
  avatar?: string;
  role: string;
  bio?: string;
  phone?: string;
  status: "active" | "inactive";
  createdAt: number;
  updatedAt: number;
  [key: string]: any;
}

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "campus"
  );
}

// ─── GET: Fetch Campus Ambassadors ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campusFilter = searchParams.get("campus")?.trim().toLowerCase();
    const statusFilter = searchParams.get("status")?.trim().toLowerCase();
    const search = searchParams.get("search")?.trim().toLowerCase();

    const ambassadorMap = new Map<string, CampusAmbassador>();

    const addAmbassador = (data: any) => {
      if (!data) return;
      const id = String(data.id || data.ambassadorId || "").trim();
      if (!id) return;

      const item: CampusAmbassador = {
        id,
        campusName: data.campusName || "Symbiosis",
        campusSlug: data.campusSlug || slugify(data.campusName || "Symbiosis"),
        userId: data.userId || "",
        userName: data.userName || data.name || "Student Ambassador",
        userEmail: data.userEmail || data.email || "",
        avatar: data.avatar || data.avatarUrl || data.photoURL || "",
        role: data.role || "Campus Ambassador",
        bio: data.bio || "",
        phone: data.phone || "",
        status: data.status === "inactive" ? "inactive" : "active",
        createdAt: Number(data.createdAt) || Date.now(),
        updatedAt: Number(data.updatedAt) || Date.now(),
      };

      ambassadorMap.set(id, item);
    };

    // 1. Fetch from DynamoDB (RealTimeChat or candidate tables with roomId = CAMPUS#AMBASSADORS)
    const candidateTables = getCandidateTableNames(TABLES.RealTimeChat);
    for (const table of candidateTables) {
      try {
        const queryRes = await docClient.send(
          new QueryCommand({
            TableName: table,
            KeyConditionExpression: "roomId = :r AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":r": ROOM_ID,
              ":skPrefix": "AMBASSADOR#",
            },
          })
        );
        if (queryRes.Items && queryRes.Items.length > 0) {
          for (const item of queryRes.Items) {
            addAmbassador(item);
          }
        }
      } catch {
        // Fallback scan on table
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: table,
              FilterExpression: "roomId = :r OR begins_with(entityId, :ePrefix)",
              ExpressionAttributeValues: {
                ":r": ROOM_ID,
                ":ePrefix": "CAMPUS_AMBASSADOR#",
              },
              Limit: 200,
            })
          );
          if (scanRes.Items && scanRes.Items.length > 0) {
            for (const item of scanRes.Items) {
              addAmbassador(item);
            }
          }
        } catch {}
      }
    }

    // 2. Fetch from Firestore candidate collections
    if (db) {
      const candidateCols = Array.from(
        new Set([
          COLLECTION_NAME,
          getFirestoreCollection(COLLECTION_NAME),
          `${COLLECTION_NAME}_dev`,
          `${COLLECTION_NAME}_prod`,
        ])
      );

      for (const col of candidateCols) {
        try {
          const snap = await db.collection(col).get();
          if (!snap.empty) {
            for (const doc of snap.docs) {
              addAmbassador({ id: doc.id, ...doc.data() });
            }
          }
        } catch (fbErr) {
          console.warn(`Firestore read notice for ${col}:`, fbErr);
        }
      }
    }

    let list = Array.from(ambassadorMap.values());

    // Filter by campus
    if (campusFilter && campusFilter !== "all") {
      list = list.filter(
        (a) =>
          a.campusSlug.includes(campusFilter) ||
          a.campusName.toLowerCase().includes(campusFilter)
      );
    }

    // Filter by status
    if (statusFilter && statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }

    // Search filter
    if (search) {
      list = list.filter(
        (a) =>
          a.userName.toLowerCase().includes(search) ||
          a.userEmail.toLowerCase().includes(search) ||
          a.campusName.toLowerCase().includes(search) ||
          a.role.toLowerCase().includes(search)
      );
    }

    // Sort newest first
    list.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json(
      {
        success: true,
        ambassadors: list,
        totalCount: list.length,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Error fetching campus ambassadors:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch campus ambassadors" },
      { status: 500 }
    );
  }
}

// ─── POST: Create / Assign Campus Ambassador ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      campusName,
      userId,
      userName,
      userEmail,
      avatar,
      role = "Campus Ambassador",
      bio = "",
      phone = "",
      status = "active",
    } = body;

    if (!campusName || !campusName.trim()) {
      return NextResponse.json(
        { success: false, error: "Campus / College name is required" },
        { status: 400 }
      );
    }

    if (!userName || !userName.trim()) {
      return NextResponse.json(
        { success: false, error: "Ambassador name is required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const id = `amb_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const campusSlug = slugify(campusName);

    const ambassadorData: CampusAmbassador = {
      id,
      campusName: campusName.trim(),
      campusSlug,
      userId: userId ? String(userId).trim() : id,
      userName: userName.trim(),
      userEmail: userEmail ? String(userEmail).trim() : "",
      avatar: avatar ? String(avatar).trim() : "",
      role: role.trim() || "Campus Ambassador",
      bio: bio ? String(bio).trim() : "",
      phone: phone ? String(phone).trim() : "",
      status: status === "inactive" ? "inactive" : "active",
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      roomId: ROOM_ID,
      sk: `AMBASSADOR#${campusSlug}#${id}`,
      entityId: `CAMPUS_AMBASSADOR#${id}`,
      contentId: `AMBASSADOR#${id}`,
      ...ambassadorData,
    };

    // Primary write to RealTimeChat + dual-write to Firestore campusAmbassadors
    await dualWrite(COLLECTION_NAME, id, TABLES.RealTimeChat, dynamoItem);

    return NextResponse.json(
      {
        success: true,
        message: "Campus ambassador assigned successfully",
        ambassador: ambassadorData,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating campus ambassador:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create campus ambassador" },
      { status: 500 }
    );
  }
}

// ─── PUT / PATCH: Update Campus Ambassador ──────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      campusName,
      userId,
      userName,
      userEmail,
      avatar,
      role,
      bio,
      phone,
      status,
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Ambassador ID is required for update" },
        { status: 400 }
      );
    }

    const cleanId = String(id).replace(/^CAMPUS_AMBASSADOR#/, "").trim();
    const now = Date.now();

    // Fetch existing ambassador record
    let existingItem: any = null;
    let existingSk: string | null = null;

    const candidateTables = getCandidateTableNames(TABLES.RealTimeChat);
    for (const table of candidateTables) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: table,
            FilterExpression: "id = :id OR contains(sk, :id) OR contains(entityId, :id)",
            ExpressionAttributeValues: { ":id": cleanId },
            Limit: 10,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          existingItem = scanRes.Items[0];
          existingSk = existingItem.sk;
          break;
        }
      } catch {}
    }

    if (!existingItem && db) {
      const candidateCols = [COLLECTION_NAME, getFirestoreCollection(COLLECTION_NAME)];
      for (const col of candidateCols) {
        try {
          const docSnap = await db.collection(col).doc(cleanId).get();
          if (docSnap.exists) {
            existingItem = { id: docSnap.id, ...docSnap.data() };
            break;
          }
        } catch {}
      }
    }

    if (!existingItem) {
      return NextResponse.json(
        { success: false, error: "Campus ambassador not found" },
        { status: 404 }
      );
    }

    const resolvedCampusName = campusName !== undefined ? campusName.trim() : existingItem.campusName;
    const campusSlug = slugify(resolvedCampusName);

    const updatedAmbassador: CampusAmbassador = {
      ...existingItem,
      id: cleanId,
      campusName: resolvedCampusName,
      campusSlug,
      userId: userId !== undefined ? String(userId).trim() : existingItem.userId,
      userName: userName !== undefined ? userName.trim() : existingItem.userName,
      userEmail: userEmail !== undefined ? String(userEmail).trim() : existingItem.userEmail,
      avatar: avatar !== undefined ? String(avatar).trim() : existingItem.avatar,
      role: role !== undefined ? role.trim() : existingItem.role || "Campus Ambassador",
      bio: bio !== undefined ? String(bio).trim() : existingItem.bio || "",
      phone: phone !== undefined ? String(phone).trim() : existingItem.phone || "",
      status: status !== undefined ? (status === "inactive" ? "inactive" : "active") : existingItem.status || "active",
      updatedAt: now,
    };

    const targetSk = existingSk || `AMBASSADOR#${campusSlug}#${cleanId}`;

    const dynamoItem = {
      roomId: ROOM_ID,
      sk: targetSk,
      entityId: `CAMPUS_AMBASSADOR#${cleanId}`,
      contentId: `AMBASSADOR#${cleanId}`,
      ...updatedAmbassador,
    };

    await dualWrite(COLLECTION_NAME, cleanId, TABLES.RealTimeChat, dynamoItem);

    return NextResponse.json({
      success: true,
      message: "Campus ambassador updated successfully",
      ambassador: updatedAmbassador,
    });
  } catch (error: any) {
    console.error("Error updating campus ambassador:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update campus ambassador" },
      { status: 500 }
    );
  }
}

export const PATCH = PUT;

// ─── DELETE: Delete Campus Ambassador ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const rawId = (
      searchParams.get("id") ||
      searchParams.get("ambassadorId") ||
      body.id ||
      body.ambassadorId ||
      ""
    ).trim();

    if (!rawId) {
      return NextResponse.json(
        { success: false, error: "Ambassador ID is required for deletion" },
        { status: 400 }
      );
    }

    const cleanId = rawId.replace(/^CAMPUS_AMBASSADOR#/, "").trim();

    // 1. Delete from DynamoDB across candidate tables
    const candidateTables = getCandidateTableNames(TABLES.RealTimeChat);
    for (const table of candidateTables) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: table,
            FilterExpression: "id = :id OR contains(sk, :id) OR contains(entityId, :id)",
            ExpressionAttributeValues: { ":id": cleanId },
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          for (const item of scanRes.Items) {
            await docClient.send(
              new DeleteCommand({
                TableName: table,
                Key: {
                  roomId: item.roomId || ROOM_ID,
                  sk: item.sk,
                },
              })
            );
          }
        }
      } catch (dynErr: any) {
        console.warn(`DynamoDB delete notice for ambassador ${cleanId}:`, dynErr.message);
      }
    }

    // 2. Delete from Firestore candidate collections
    if (db) {
      const candidateCols = Array.from(
        new Set([
          COLLECTION_NAME,
          getFirestoreCollection(COLLECTION_NAME),
          `${COLLECTION_NAME}_dev`,
          `${COLLECTION_NAME}_prod`,
        ])
      );

      for (const col of candidateCols) {
        try {
          await db.collection(col).doc(cleanId).delete();
        } catch (fbErr: any) {
          console.warn(`Firestore delete notice for ambassador ${cleanId}:`, fbErr.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Campus ambassador deleted successfully",
      id: cleanId,
    });
  } catch (error: any) {
    console.error("Error deleting campus ambassador:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete campus ambassador" },
      { status: 500 }
    );
  }
}
