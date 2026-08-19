// api/admin/store/addBrand/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface VariantInput {
  size: string;
  stock: string | number;
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    
    if (id) {
      let brandData: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
        }));
        if (getRes.Item) {
          brandData = { id, ...getRes.Item };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddBrand GET] DynamoDB get failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeProducts").doc(id).get();
          if (doc.exists) {
            brandData = { id: doc.id, ...doc.data() };
          }
        } catch (fsErr) {
          console.error("[AddBrand GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!brandData) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: brandData });
    }

    let list: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND category = :cat",
        ExpressionAttributeValues: { ":p": "PRODUCT#", ":cat": "brands" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        list = scanRes.Items.map(item => ({
          id: (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AddBrand GET list] DynamoDB scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || list.length === 0) {
      try {
        const snapshot = await db.collection("storeProducts").where("category", "==", "brands").get();
        list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[AddBrand GET list] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching brand product(s):", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      brand,
      title,
      description,
      image,
      governance_state = "pending review",
      isFeatured = false,
      rating = 0,
      reviews = 0,
      rewardCoins = 0,
      originalPriceRupees,
      priceRupees,
      addTag = false,
      tag,
      variants = [],
    } = body;

    // Required fields validation
    if (!brand || !title || !description || !image || originalPriceRupees === undefined || priceRupees === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (brand, title, description, image, original price, sale/current price)" },
        { status: 400 }
      );
    }

    const originalPriceVal = Number(originalPriceRupees) * 100;
    const pricePaise = Number(priceRupees) * 100;

    if (pricePaise > originalPriceVal) {
      return NextResponse.json(
        { success: false, error: "Sale price cannot be higher than original price" },
        { status: 400 }
      );
    }

    let totalStock = 0;
    const formattedVariants = [];
    if (Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        const item: VariantInput = variants[i];
        if (!item.size || item.stock === undefined || item.stock === "") {
          return NextResponse.json(
            { success: false, error: `Variant row ${i + 1} has missing fields (size or stock)` },
            { status: 400 }
          );
        }
        
        const stockNum = parseInt(String(item.stock), 10);
        if (isNaN(stockNum) || stockNum < 0) {
          return NextResponse.json(
            { success: false, error: `Variant row ${i + 1} stock must be a non-negative integer` },
            { status: 400 }
          );
        }

        const sizeId = item.size.toLowerCase().replace(/\s+/g, "");

        formattedVariants.push({
          id: sizeId,
          size: item.size,
          stock: stockNum,
          available: stockNum > 0,
        });

        totalStock += stockNum;
      }
    }

    let promoTag = null;
    if (addTag && tag && tag.label) {
      promoTag = {
        label: tag.label,
        color: tag.color || "#CD620E",
      };
    }

    const docId = `brand-product-${Date.now()}`;
    const now = Date.now();

    const newBrandProduct = {
      id: docId,
      category: "brands",
      brand,
      title,
      description,
      image,
      currency: "INR",
      governance_state: governance_state || "pending review",
      isFeatured: Boolean(isFeatured),
      rating: Number(rating) || 0,
      reviews: Number(reviews) || 0,
      rewardCoins: Number(rewardCoins) || 0,
      originalPriceVal,
      pricePaise,
      ...(promoTag ? { tag: promoTag } : {}),
      variants: formattedVariants,
      totalStock,
      isAvailable: totalStock > 0,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: {
          entityId: `PRODUCT#${docId}`,
          sk: `PRODUCT#${docId}`,
          ...newBrandProduct
        }
      }));
    } catch (dynErr) {
      console.warn("[AddBrand POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(docId).set(newBrandProduct);
    } catch (fsErr) {
      console.warn("[AddBrand POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id: docId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding brand product:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
    }

    const body = await req.json();

    const {
      brand,
      title,
      description,
      image,
      governance_state = "pending review",
      isFeatured = false,
      rating = 0,
      reviews = 0,
      rewardCoins = 0,
      originalPriceRupees,
      priceRupees,
      addTag = false,
      tag,
      variants = [],
    } = body;

    if (!brand || !title || !description || !image || originalPriceRupees === undefined || priceRupees === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const originalPriceVal = Number(originalPriceRupees) * 100;
    const pricePaise = Number(priceRupees) * 100;

    if (pricePaise > originalPriceVal) {
      return NextResponse.json(
        { success: false, error: "Sale price cannot be higher than original price" },
        { status: 400 }
      );
    }

    let totalStock = 0;
    const formattedVariants = [];
    if (Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        const item: VariantInput = variants[i];
        if (!item.size || item.stock === undefined || item.stock === "") {
          return NextResponse.json(
            { success: false, error: `Variant row ${i + 1} has missing fields (size or stock)` },
            { status: 400 }
          );
        }
        
        const stockNum = parseInt(String(item.stock), 10);
        if (isNaN(stockNum) || stockNum < 0) {
          return NextResponse.json(
            { success: false, error: `Variant row ${i + 1} stock must be a non-negative integer` },
            { status: 400 }
          );
        }

        const sizeId = item.size.toLowerCase().replace(/\s+/g, "");

        formattedVariants.push({
          id: sizeId,
          size: item.size,
          stock: stockNum,
          available: stockNum > 0,
        });

        totalStock += stockNum;
      }
    }

    let promoTag = null;
    if (addTag && tag && tag.label) {
      promoTag = {
        label: tag.label,
        color: tag.color || "#CD620E",
      };
    }

    const now = Date.now();
    const updatedBrandProduct: any = {
      brand,
      title,
      description,
      image,
      governance_state: governance_state || "pending review",
      isFeatured: Boolean(isFeatured),
      rating: Number(rating) || 0,
      reviews: Number(reviews) || 0,
      rewardCoins: Number(rewardCoins) || 0,
      originalPriceVal,
      pricePaise,
      variants: formattedVariants,
      totalStock,
      isAvailable: totalStock > 0,
      updatedAt: now,
    };

    if (promoTag) {
      updatedBrandProduct.tag = promoTag;
    } else {
      updatedBrandProduct.tag = null;
    }

    // 1. Update in DynamoDB first
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
      }));
      const existingItem = getRes.Item;
      const finalItem = {
        ...existingItem,
        ...updatedBrandProduct,
        entityId: `PRODUCT#${id}`,
        sk: `PRODUCT#${id}`
      };
      if (!promoTag) {
        delete finalItem.tag;
      }
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: finalItem
      }));
    } catch (dynErr) {
      console.warn("[AddBrand PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("storeProducts").doc(id);
      if (!promoTag) {
        // use set with merge, but delete tag manually
        await docRef.set(updatedBrandProduct, { merge: true });
        await docRef.update({ tag: null });
      } else {
        await docRef.set(updatedBrandProduct, { merge: true });
      }
    } catch (fsErr) {
      console.warn("[AddBrand PUT] Firestore fallback failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating brand product:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
    }

    // 1. Delete from DynamoDB first
    try {
      await docClient.send(new DeleteCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
      }));
    } catch (dynErr) {
      console.warn("[AddBrand DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("storeProducts").doc(id);
      await docRef.delete();
    } catch (fsErr) {
      console.warn("[AddBrand DELETE] Firestore fallback delete failed:", fsErr);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting brand product:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
