// app/api/admin/channels/route.ts — Universal Channels Management API
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { ScanCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export interface ChannelItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ─── GET /api/admin/channels — List all channels ────────────────────────────
export async function GET() {
  try {
    let channels: ChannelItem[] = [];

    // 1. Try DynamoDB SocialAndContent table with Query on contentId = CONFIG#CHANNELS or scan
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLES.SocialAndContent,
          KeyConditionExpression: "contentId = :cid",
          ExpressionAttributeValues: { ":cid": "CONFIG#CHANNELS" },
        })
      );
      if (res.Items && res.Items.length > 0) {
        channels = res.Items.map((item: any) => ({
          id: item.id || (item.sk ? item.sk.replace(/^CHANNEL#/i, "") : ""),
          name: item.name || item.title || item.label || "",
          createdAt: item.createdAt || 0,
          updatedAt: item.updatedAt || 0,
        })).filter(c => c.id && c.name);
      }
    } catch (dynErr) {
      console.warn("[Channels GET] DynamoDB query notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (channels.length === 0 && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("channels")).get();
        if (!snap.empty) {
          channels = snap.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || data.title || data.label || doc.id,
              createdAt: data.createdAt || 0,
              updatedAt: data.updatedAt || 0,
            };
          });
        }
      } catch (fsErr) {
        console.warn("[Channels GET] Firestore channels fetch notice:", fsErr);
      }
    }

    // Default channels seed if empty
    if (channels.length === 0) {
      channels = [
        { id: "all", name: "All", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "experts", name: "Experts", createdAt: Date.now(), updatedAt: Date.now() },
        { id: "analysts", name: "Analysts", createdAt: Date.now(), updatedAt: Date.now() },
       
      ];
    }

    return NextResponse.json({ success: true, channels });
  } catch (error) {
    console.error("[GET /api/admin/channels] error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch channels" }, { status: 500 });
  }
}

// ─── POST /api/admin/channels — Create new channel ──────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json({ success: false, error: "Channel name is required" }, { status: 400 });
    }

    const id = String(body.id || name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "")).trim();
    const now = Date.now();

    const channelItem: ChannelItem = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Save to DynamoDB SocialAndContent table
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: "CONFIG#CHANNELS",
            sk: `CHANNEL#${id}`,
            entityId: `CHANNEL#${id}`,
            ...channelItem,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Channels POST] DynamoDB write notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("channels")).doc(id).set(channelItem, { merge: true });
      } catch (fsErr) {
        console.warn("[Channels POST] Firestore write notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, channel: channelItem });
  } catch (error) {
    console.error("[POST /api/admin/channels] error:", error);
    return NextResponse.json({ success: false, error: "Failed to create channel" }, { status: 500 });
  }
}
