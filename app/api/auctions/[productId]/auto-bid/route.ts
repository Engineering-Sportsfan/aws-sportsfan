// app/api/auctions/[productId]/auto-bid/route.ts — Migrated to AWS DynamoDB (EcommerceAndOrders Table)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { docClient } from '@/lib/dynamodb';
import { dualWrite } from '@/lib/dualWrite';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ productId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const { productId } = resolvedParams;
    const body = await request.json().catch(() => ({}));
    const maxCeilingPaise = Number(body.maxCeilingPaise);
    const isActive = Boolean(body.isActive);
    const userId = body.userId || 'mock-user-123';

    if (isNaN(maxCeilingPaise) || maxCeilingPaise <= 0) {
      return NextResponse.json({ error: 'Invalid max ceiling amount' }, { status: 400 });
    }

    let productData: any = null;

    // 1. Check DynamoDB EcommerceAndOrders
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: 'EcommerceAndOrders',
          Key: {
            orderOrItemId: `PRODUCT#${productId}`,
            sk: 'PRODUCT#META',
          },
        })
      );
      if (getRes.Item) productData = getRes.Item;
    } catch (e) {
      console.warn('[auto-bid POST] DynamoDB notice:', e);
    }

    // 2. Fallback to Firestore
    const productRef = db ? db.collection('storeProducts').doc(productId) : null;
    if (!productData && productRef) {
      const productDoc = await productRef.get();
      if (productDoc.exists) {
        productData = productDoc.data();
      }
    }

    if (!productData) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (productData.category?.toLowerCase() !== 'auctions') {
      return NextResponse.json({ error: 'INVALID_CATEGORY' }, { status: 400 });
    }

    const now = Date.now();
    const autoBidData = {
      productId,
      userId,
      maxCeilingPaise,
      isActive,
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write
    await dualWrite({
      tableName: 'EcommerceAndOrders',
      dynamoItem: {
        orderOrItemId: `PRODUCT#${productId}#AUTOBID#${userId}`,
        sk: 'AUTOBID#META',
        ...autoBidData,
      },
      firestoreRef: productRef ? productRef.collection('autoBids').doc(userId) : undefined,
      firestoreData: {
        maxCeilingPaise,
        isActive,
        createdAt: FieldValue.serverTimestamp(),
      },
    });

    return NextResponse.json({
      success: true,
      productId,
      userId,
      maxCeilingPaise,
      isActive,
    });
  } catch (error: any) {
    console.error('Auto-Bid API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
