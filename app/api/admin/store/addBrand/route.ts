import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface VariantInput {
  size: string;
  stock: string | number;
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

    // Generate brand-product- ID
    const docId = `brand-product-${Date.now()}`;
    const docRef = db.collection("storeProducts").doc(docId);

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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(newBrandProduct);

    return NextResponse.json({ success: true, id: docId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding brand product:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
