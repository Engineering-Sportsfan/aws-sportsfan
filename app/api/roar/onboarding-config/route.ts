// app/api/roar/onboarding-config/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type ConfigType = "sports" | "engagement" | "followEntities";
const VALID_TYPES: ConfigType[] = ["sports", "engagement", "followEntities"];

function collectionFor(type: ConfigType) {
  return db.collection("roarOnboardingConfig").doc(type).collection("items");
}

// ?type=sports|engagement|followEntities (required)
// ?all=true — admin form passes this to also see inactive items
export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") as ConfigType | null;
    const includeInactive = req.nextUrl.searchParams.get("all") === "true";

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "type must be one of sports|engagement|followEntities" }, { status: 400 });
    }

    let items: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try fetching from DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "IdentityAndAccess",
        KeyConditionExpression: "entityId = :e AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":e": "roarOnboardingConfig",
          ":p": `ONBOARDING_CONFIG#${type}#`
        }
      }));

      if (res.Items) {
        let filtered = res.Items;
        if (!includeInactive) {
          filtered = res.Items.filter(item => item.active === true);
        }
        // Sort in memory by order asc
        filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        items = filtered;
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[OnboardingConfig GET] DynamoDB fetch failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        let query: FirebaseFirestore.Query = collectionFor(type);
        if (!includeInactive) query = query.where("active", "==", true);
        query = query.orderBy("order", "asc");

        const snap = await query.get();
        items = snap.docs.map((d) => d.data());
      } catch (fsErr) {
        console.error("[OnboardingConfig GET] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, type, items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, item } = body as { type: ConfigType; item: any };

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!item?.label) {
      return NextResponse.json({ error: "item.label is required" }, { status: 400 });
    }
    if (type === "followEntities" && (!item.sportId || !item.category)) {
      return NextResponse.json({ error: "followEntities requires sportId and category" }, { status: 400 });
    }

    const itemId = `item_${Math.random().toString(36).substring(2, 15)}`;
    const now = Date.now();
    const data = {
      ...item,
      id: itemId,
      order: typeof item.order === "number" ? item.order : now,
      active: item.active ?? true,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: "IdentityAndAccess",
        Item: {
          entityId: "roarOnboardingConfig",
          sk: `ONBOARDING_CONFIG#${type}#${itemId}`,
          ...data
        }
      }));
    } catch (dynErr) {
      console.warn("[OnboardingConfig POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await collectionFor(type).doc(itemId).set(data);
    } catch (fsErr) {
      console.warn("[OnboardingConfig POST] Firestore fallback sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, item: data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, id, updates } = body as { type: ConfigType; id: string; updates: any };

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    let existingData: any = null;
    let fetchedFromDynamo = false;

    // 1. Get from DynamoDB first
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "IdentityAndAccess",
        Key: { entityId: "roarOnboardingConfig", sk: `ONBOARDING_CONFIG#${type}#${id}` }
      }));
      if (getRes.Item) {
        existingData = getRes.Item;
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[OnboardingConfig PATCH] DynamoDB fetch failed:", dynErr);
    }

    if (!fetchedFromDynamo) {
      try {
        const ref = collectionFor(type).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
          existingData = doc.data();
        }
      } catch (fsErr) {
        console.warn("[OnboardingConfig PATCH] Firestore fetch failed:", fsErr);
      }
    }

    if (!existingData) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const merged = {
      ...existingData,
      ...updates,
      updatedAt: Date.now()
    };

    // Remove partition/sort key names if they got duplicated/merged inside item fields
    const { entityId: _, sk: __, ...cleanMerged } = merged;

    // Write back updated to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: "IdentityAndAccess",
        Item: {
          entityId: "roarOnboardingConfig",
          sk: `ONBOARDING_CONFIG#${type}#${id}`,
          ...cleanMerged
        }
      }));
    } catch (dynErr) {
      console.warn("[OnboardingConfig PATCH] DynamoDB update failed:", dynErr);
    }

    // Sync to Firestore
    try {
      await collectionFor(type).doc(id).update({ ...updates, updatedAt: Date.now() });
    } catch (fsErr) {
      console.warn("[OnboardingConfig PATCH] Firestore fallback update failed:", fsErr);
    }

    return NextResponse.json({ success: true, item: cleanMerged });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") as ConfigType | null;
    const id = req.nextUrl.searchParams.get("id");

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // 1. Delete from DynamoDB
    try {
      await docClient.send(new DeleteCommand({
        TableName: "IdentityAndAccess",
        Key: { entityId: "roarOnboardingConfig", sk: `ONBOARDING_CONFIG#${type}#${id}` }
      }));
    } catch (dynErr) {
      console.warn("[OnboardingConfig DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await collectionFor(type).doc(id).delete();
    } catch (fsErr) {
      console.warn("[OnboardingConfig DELETE] Firestore fallback delete failed:", fsErr);
    }

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}