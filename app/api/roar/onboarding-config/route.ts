// app/api/roar/onboarding-config/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";

export const dynamic = "force-dynamic";

type ConfigType = "sports" | "engagement" | "followEntities" | "requestedSports";
const VALID_TYPES: ConfigType[] = ["sports", "engagement", "followEntities", "requestedSports"];

const DEFAULT_REQUESTED_SPORTS = [
  "Basketball",
  "Tennis",
  "Badminton",
  "Formula 1 / Motorsports",
  "Hockey",
  "Kabaddi",
  "Baseball",
  "Golf",
  "Boxing",
  "Volleyball",
  "Table Tennis",
];

const DEFAULT_QUESTIONS: Record<ConfigType, { question: string; subtitle: string }> = {
  sports: {
    question: "What sports do you follow?",
    subtitle: "Select one or more sports to personalize your feed & live rooms",
  },
  followEntities: {
    question: "What do you follow?",
    subtitle: "<pick 1 or more>",
  },
  engagement: {
    question: "How do you like your sports?",
    subtitle: "<pick 1 or more>",
  },
  requestedSports: {
    question: "Don't see your favorite sports?",
    subtitle: "Please select and we will work hard to get it to you soonest",
  },
};

function collectionFor(type: ConfigType) {
  return db.collection(getFirestoreCollection("roarOnboardingConfig")).doc(type).collection("items");
}

// ?type=sports|engagement|followEntities|requestedSports (required)
// ?all=true — admin form passes this to also see inactive items
// ?demand=true — returns user request counts for requestedSports
export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") as ConfigType | null;
    const includeInactive = req.nextUrl.searchParams.get("all") === "true";
    const includeDemand = req.nextUrl.searchParams.get("demand") === "true";

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "type must be one of sports|engagement|followEntities|requestedSports" }, { status: 400 });
    }

    let items: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try fetching items from DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: TABLES.IdentityAndAccess,
        KeyConditionExpression: "entityId = :e AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":e": "roarOnboardingConfig",
          ":p": `ONBOARDING_CONFIG#${type}#`
        }
      }));

      if (res.Items && res.Items.length > 0) {
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

    // 2. Fallback to Firestore for items
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

    // 3. Fetch the Step Question & Subtitle
    let questionData = { ...DEFAULT_QUESTIONS[type] };

    try {
      const qRes = await docClient.send(new GetCommand({
        TableName: TABLES.IdentityAndAccess,
        Key: {
          entityId: "roarOnboardingConfig",
          sk: `ONBOARDING_QUESTION#${type}`,
        },
      }));
      if (qRes.Item?.question) {
        questionData = {
          question: qRes.Item.question,
          subtitle: qRes.Item.subtitle !== undefined ? qRes.Item.subtitle : questionData.subtitle,
        };
      } else {
        // Fallback to Firestore doc root
        try {
          const docSnap = await db.collection(getFirestoreCollection("roarOnboardingConfig")).doc(type).get();
          if (docSnap.exists) {
            const d = docSnap.data();
            if (d?.question) {
              questionData = {
                question: d.question,
                subtitle: d.subtitle !== undefined ? d.subtitle : questionData.subtitle,
              };
            }
          }
        } catch (fsErr) {
          console.warn("[OnboardingConfig GET] Firestore question fetch failed:", fsErr);
        }
      }
    } catch (dynErr) {
      console.warn("[OnboardingConfig GET] DynamoDB question fetch failed:", dynErr);
      try {
        const docSnap = await db.collection(getFirestoreCollection("roarOnboardingConfig")).doc(type).get();
        if (docSnap.exists) {
          const d = docSnap.data();
          if (d?.question) {
            questionData = {
              question: d.question,
              subtitle: d.subtitle !== undefined ? d.subtitle : questionData.subtitle,
            };
          }
        }
      } catch (fsErr) {
        console.warn("[OnboardingConfig GET] Firestore question fallback failed:", fsErr);
      }
    }

    // If requestedSports has no items yet, fallback to default sports list
    if (type === "requestedSports" && items.length === 0) {
      items = DEFAULT_REQUESTED_SPORTS.map((s, idx) => ({
        id: `req_${s.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        label: s,
        order: idx,
        active: true,
      }));
    }

    // Optional: Fetch demand analytics if requested (for admin)
    let demandMap: Record<string, number> = {};
    if (type === "requestedSports" && includeDemand) {
      try {
        const demandRes = await docClient.send(new QueryCommand({
          TableName: TABLES.IdentityAndAccess,
          KeyConditionExpression: "entityId = :e",
          ExpressionAttributeValues: { ":e": "roarOnboardingDemand" }
        }));
        if (demandRes.Items) {
          for (const it of demandRes.Items) {
            if (it.sport) demandMap[it.sport] = it.count || 0;
          }
        }
      } catch (err) {
        console.warn("[OnboardingConfig GET demand] failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      type,
      question: questionData.question,
      subtitle: questionData.subtitle,
      items,
      ...(includeDemand ? { demand: demandMap } : {}),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, item, items: bulkItems, action } = body as {
      type: ConfigType;
      item?: any;
      items?: any[];
      action?: string;
    };

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    // ── Handle Action: Rename Category / Title ──────────────────────────
    if (action === "renameTitle") {
      const { oldTitle, newTitle } = body as { oldTitle: string; newTitle: string };
      if (!oldTitle || !newTitle) {
        return NextResponse.json({ error: "oldTitle and newTitle required" }, { status: 400 });
      }

      // Query all items for this type from DynamoDB
      try {
        const res = await docClient.send(new QueryCommand({
          TableName: TABLES.IdentityAndAccess,
          KeyConditionExpression: "entityId = :e AND begins_with(sk, :p)",
          ExpressionAttributeValues: {
            ":e": "roarOnboardingConfig",
            ":p": `ONBOARDING_CONFIG#${type}#`
          }
        }));

        const matching = (res.Items || []).filter(
          it => (it.category === oldTitle || it.title === oldTitle)
        );

        for (const it of matching) {
          const updated = { ...it, category: newTitle, title: newTitle, updatedAt: Date.now() };
          await docClient.send(new PutCommand({
            TableName: TABLES.IdentityAndAccess,
            Item: updated,
          }));
          try {
            await collectionFor(type).doc(it.id).set(updated, { merge: true });
          } catch (_) {}
        }
      } catch (err) {
        console.warn("[OnboardingConfig POST renameTitle] DynamoDB query/update error:", err);
      }

      return NextResponse.json({ success: true, renamed: true, oldTitle, newTitle });
    }

    // ── Handle Action: Delete Category / Title ──────────────────────────
    if (action === "deleteTitle") {
      const { title } = body as { title: string };
      if (!title) {
        return NextResponse.json({ error: "title required" }, { status: 400 });
      }

      try {
        const res = await docClient.send(new QueryCommand({
          TableName: TABLES.IdentityAndAccess,
          KeyConditionExpression: "entityId = :e AND begins_with(sk, :p)",
          ExpressionAttributeValues: {
            ":e": "roarOnboardingConfig",
            ":p": `ONBOARDING_CONFIG#${type}#`
          }
        }));

        const matching = (res.Items || []).filter(
          it => (it.category === title || it.title === title)
        );

        for (const it of matching) {
          await docClient.send(new DeleteCommand({
            TableName: TABLES.IdentityAndAccess,
            Key: { entityId: "roarOnboardingConfig", sk: `ONBOARDING_CONFIG#${type}#${it.id}` }
          }));
          try {
            await collectionFor(type).doc(it.id).delete();
          } catch (_) {}
        }
      } catch (err) {
        console.warn("[OnboardingConfig POST deleteTitle] Error:", err);
      }

      return NextResponse.json({ success: true, deleted: true, title });
    }

    // ── Handle Bulk Insertion of Multiple Options ───────────────────────
    if (bulkItems && Array.isArray(bulkItems) && bulkItems.length > 0) {
      const createdItems = [];
      for (const singleItem of bulkItems) {
        if (!singleItem?.label?.trim()) continue;
        const itemId = `item_${Math.random().toString(36).substring(2, 15)}`;
        const now = Date.now();
        const cat = singleItem.category || singleItem.title || "Sports";
        const data = {
          ...singleItem,
          id: itemId,
          label: singleItem.label.trim(),
          category: cat,
          title: cat,
          order: typeof singleItem.order === "number" ? singleItem.order : now,
          active: singleItem.active ?? true,
          createdAt: now,
          updatedAt: now,
        };

        try {
          await docClient.send(new PutCommand({
            TableName: TABLES.IdentityAndAccess,
            Item: {
              entityId: "roarOnboardingConfig",
              sk: `ONBOARDING_CONFIG#${type}#${itemId}`,
              ...data
            }
          }));
        } catch (dynErr) {
          console.warn("[OnboardingConfig POST bulk] DynamoDB write failed:", dynErr);
        }

        try {
          await collectionFor(type).doc(itemId).set(data);
        } catch (fsErr) {
          console.warn("[OnboardingConfig POST bulk] Firestore fallback failed:", fsErr);
        }

        createdItems.push(data);
      }

      return NextResponse.json({ success: true, items: createdItems });
    }

    // ── Single Item Creation ────────────────────────────────────────────
    if (!item?.label) {
      return NextResponse.json({ error: "item.label is required" }, { status: 400 });
    }

    const itemId = `item_${Math.random().toString(36).substring(2, 15)}`;
    const now = Date.now();
    const category = item.category || item.title || (type === "followEntities" ? "Sports" : undefined);

    const data = {
      ...item,
      id: itemId,
      label: item.label.trim(),
      category: category,
      title: category,
      order: typeof item.order === "number" ? item.order : now,
      active: item.active ?? true,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.IdentityAndAccess,
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
        TableName: TABLES.IdentityAndAccess,
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
        TableName: TABLES.IdentityAndAccess,
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
        TableName: TABLES.IdentityAndAccess,
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

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, question, subtitle } = body as {
      type: ConfigType;
      question?: string;
      subtitle?: string;
    };

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type. Must be sports, followEntities, engagement, or requestedSports." }, { status: 400 });
    }
    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Question title is required." }, { status: 400 });
    }

    const trimmedQuestion = question.trim();
    const trimmedSubtitle = typeof subtitle === "string" ? subtitle.trim() : "";
    const now = Date.now();

    const data = {
      type,
      question: trimmedQuestion,
      subtitle: trimmedSubtitle,
      updatedAt: now,
    };

    // 1. Put in DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.IdentityAndAccess,
        Item: {
          entityId: "roarOnboardingConfig",
          sk: `ONBOARDING_QUESTION#${type}`,
          ...data,
        },
      }));
    } catch (dynErr) {
      console.warn("[OnboardingConfig PUT] DynamoDB question write failed:", dynErr);
    }

    // 2. Fallback / sync to Firestore doc root
    try {
      await db.collection(getFirestoreCollection("roarOnboardingConfig")).doc(type).set(data, { merge: true });
    } catch (fsErr) {
      console.warn("[OnboardingConfig PUT] Firestore fallback sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PUT /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}