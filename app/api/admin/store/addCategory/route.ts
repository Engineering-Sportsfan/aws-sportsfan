// api/admin/store/addCategory/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, ScanCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      let categoryData: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB first
      try {
        const qRes = await docClient.send(new QueryCommand({
          TableName: "StoreAndCommerce",
          KeyConditionExpression: "entityId = :e",
          ExpressionAttributeValues: { ":e": `CATEGORY#${id}` },
          Limit: 1
        }));
        if (qRes.Items && qRes.Items.length > 0) {
          categoryData = { id, ...qRes.Items[0] };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddCategory GET] DynamoDB query failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeCategories").doc(id).get();
          if (doc.exists) {
            categoryData = { id: doc.id, ...doc.data() };
          }
        } catch (fsErr) {
          console.error("[AddCategory GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!categoryData) {
        return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: categoryData });
    } else {
      let list: any[] = [];
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB scan
      try {
        const scanRes = await docClient.send(new ScanCommand({
          TableName: "StoreAndCommerce",
          FilterExpression: "begins_with(entityId, :p)",
          ExpressionAttributeValues: { ":p": "CATEGORY#" }
        }));
        if (scanRes.Items && scanRes.Items.length > 0) {
          list = scanRes.Items.map(item => ({
            id: (item.entityId as string).replace(/^CATEGORY#/, ""),
            ...item
          }));
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddCategory GET list] DynamoDB scan failed:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo || list.length === 0) {
        try {
          const snapshot = await db.collection("storeCategories").get();
          list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (fsErr) {
          console.error("[AddCategory GET list] Firestore fallback failed:", fsErr);
        }
      }

      return NextResponse.json({ success: true, data: list });
    }
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      bgOpacity,
      color,
      icon,
      key,
      label,
      route,
      sport,
      status,
    } = body;

    if (!key || !label || !sport || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const id = `cat_${Math.random().toString(36).substring(2, 15)}`;
    const now = Date.now();

    const newDoc = {
      bgOpacity: Number(bgOpacity) || 0,
      color: color || "",
      icon: icon || "",
      key: key || "",
      label: label || "",
      route: route || "",
      sport: sport || "",
      status: status || "",
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: {
          entityId: `CATEGORY#${id}`,
          sk: `CATEGORY#${now}`,
          id,
          ...newDoc
        }
      }));
    } catch (dynErr) {
      console.warn("[AddCategory POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeCategories").doc(id).set(newDoc);
    } catch (fsErr) {
      console.warn("[AddCategory POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      id,
      message: "Category added successfully"
    }, { status: 201 });

  } catch (error: any) {
    console.error("Error adding category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add category" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const body = await req.json();
    const {
      bgOpacity,
      color,
      icon,
      key,
      label,
      route,
      sport,
      status,
    } = body;

    if (!key || !label || !sport || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const updatedDoc = {
      bgOpacity: Number(bgOpacity) || 0,
      color: color || "",
      icon: icon || "",
      key: key || "",
      label: label || "",
      route: route || "",
      sport: sport || "",
      status: status || "",
      updatedAt: now,
    };

    // 1. Update in DynamoDB first
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "StoreAndCommerce",
        KeyConditionExpression: "entityId = :e",
        ExpressionAttributeValues: { ":e": `CATEGORY#${id}` },
        Limit: 1
      }));
      const existingItem = qRes.Items?.[0];
      if (existingItem) {
        await docClient.send(new PutCommand({
          TableName: "StoreAndCommerce",
          Item: {
            ...existingItem,
            ...updatedDoc,
            entityId: `CATEGORY#${id}`,
            sk: existingItem.sk
          }
        }));
      }
    } catch (dynErr) {
      console.warn("[AddCategory PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeCategories").doc(id).set(updatedDoc, { merge: true });
    } catch (fsErr) {
      console.warn("[AddCategory PUT] Firestore fallback failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      id,
      message: "Category updated successfully"
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error updating category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update category" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    // 1. Delete from DynamoDB first
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "StoreAndCommerce",
        KeyConditionExpression: "entityId = :e",
        ExpressionAttributeValues: { ":e": `CATEGORY#${id}` },
        Limit: 1
      }));
      const existingItem = qRes.Items?.[0];
      if (existingItem) {
        await docClient.send(new DeleteCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `CATEGORY#${id}`, sk: existingItem.sk }
        }));
      }
    } catch (dynErr) {
      console.warn("[AddCategory DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("storeCategories").doc(id);
      await docRef.delete();
    } catch (fsErr) {
      console.warn("[AddCategory DELETE] Firestore fallback delete failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Category deleted successfully"
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete category" },
      { status: 500 }
    );
  }
}
