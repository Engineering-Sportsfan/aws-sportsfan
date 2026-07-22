import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

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

    const productRef = db.collection('storeProducts').doc(productId);

    // Verify product exists and category is correct
    const productDoc = await productRef.get();
    if (!productDoc.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    const productData = productDoc.data();
    if (!productData || productData.category?.toLowerCase() !== 'auctions') {
      return NextResponse.json({ error: 'INVALID_CATEGORY' }, { status: 400 });
    }

    const autoBidRef = productRef.collection('autoBids').doc(userId);
    await autoBidRef.set({
      maxCeilingPaise,
      isActive,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({
      success: true,
      productId,
      userId,
      maxCeilingPaise,
      isActive
    });
  } catch (error: any) {
    console.error('Auto-Bid API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
