import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';
import Razorpay from 'razorpay';
import { FieldValue } from 'firebase-admin/firestore';

const storeService = new StoreService(db);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { productId, slotId, variantId, userId, idempotencyKey, pricePaise: clientPricePaise } = body;

    if (!productId || !userId || !idempotencyKey) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_z8iSqYm0WqfH1d',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    // Check Idempotency Status
    const idempotencyRef = db.collection('idempotencyKeys').doc(idempotencyKey);
    const idempotencyDoc = await idempotencyRef.get();
    if (idempotencyDoc.exists) {
      const data = idempotencyDoc.data();
      if (data?.status === 'completed') {
        return NextResponse.json(data.response || { success: true });
      }
      if (data?.status === 'pending' && data?.razorpayOrderId) {
        return NextResponse.json({
          razorpayOrderId: data.razorpayOrderId,
          amount: data.amount,
          currency: 'INR',
        });
      }
    }

    // Fetch Product & Validate
    let product;
    try {
      product = await storeService.getProductById(productId);
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Product not found' }, { status: 404 });
    }

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (slotId) {
      const slotRef = db.collection('storeProducts').doc(productId).collection('slots').doc(slotId);
      const slotDoc = await slotRef.get();
      if (!slotDoc.exists) {
        return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
      }
      const slot = slotDoc.data();
      if (slot?.status === 'booked') {
        return NextResponse.json({ error: 'Slot is already booked' }, { status: 400 });
      }
      const now = new Date();
      if ((slot?.status === 'locked' || slot?.status === 'reserved') && slot.lockExpiresAt) {
        const expiresAt = slot.lockExpiresAt.toDate ? slot.lockExpiresAt.toDate() : new Date(slot.lockExpiresAt);
        if (expiresAt > now && slot.lockedBy !== userId) {
          return NextResponse.json({ error: 'Slot is locked by another user' }, { status: 400 });
        }
      }
    }

    if (product.category === 'brands') {
      if (!variantId) {
        return NextResponse.json({ error: 'Size selection is required' }, { status: 400 });
      }
      const variants = product.variants || [];
      const variant = variants.find((v: any) => v.id === variantId);
      if (!variant) {
        return NextResponse.json({ error: `Selected variant "${variantId}" not found` }, { status: 404 });
      }
      if (variant.stock <= 0 || !variant.available) {
        return NextResponse.json({ error: `Variant "${variant.size}" is out of stock` }, { status: 400 });
      }
    }

    const pCatLower = (product.category || '').toLowerCase();
    if ((pCatLower === 'experience' || pCatLower === 'experiences') && !slotId) {
      const seatsBooked = product.seatsBooked || 0;
      const totalSeats = product.totalSeats || 0;
      if (seatsBooked >= totalSeats) {
        return NextResponse.json({ error: 'No seats left' }, { status: 400 });
      }
    }

    // Derive price: prefer Firestore value, fall back to client-sent pricePaise
    // (some products like experiences have prices defined only in the frontend)
    let derivedPrice = 0;
    if (pCatLower === 'auctions') {
      derivedPrice = product.currentBidPaise || product.pricePaise || 0;
    } else {
      derivedPrice = product.pricePaise || 0;
    }

    // Fall back to client-sent price for products with no Firestore price
    if (derivedPrice <= 0 && clientPricePaise && clientPricePaise > 0) {
      derivedPrice = clientPricePaise;
    }

    if (derivedPrice <= 0) {
      return NextResponse.json({ error: 'Invalid product price' }, { status: 400 });
    }

    // Create Razorpay order
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: derivedPrice,
        currency: 'INR',
        receipt: `receipt_${idempotencyKey.substring(0, 30)}`,
        notes: {
          productId,
          slotId: slotId || '',
          variantId: variantId || '',
          userId,
        },
      });
    } catch (e: any) {
      console.error('Razorpay Order Creation Failed:', e);
      return NextResponse.json({ error: e.message || 'Razorpay order creation failed' }, { status: 500 });
    }

    await idempotencyRef.set({
      status: 'pending',
      razorpayOrderId: razorpayOrder.id,
      amount: derivedPrice,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      razorpayOrderId: razorpayOrder.id,
      amount: derivedPrice,
      currency: 'INR',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
