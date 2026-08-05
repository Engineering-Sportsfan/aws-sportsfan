import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

const storeService = new StoreService(db);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, checkoutPayload } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !checkoutPayload) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const { idempotencyKey, pricePaise } = checkoutPayload;

    if (!idempotencyKey) {
      return NextResponse.json({ error: 'Missing idempotency key in payload' }, { status: 400 });
    }

    // Verify Razorpay Signature
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generated_signature = crypto.createHmac('sha256', secret).update(text).digest('hex');

    if (generated_signature !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    // Fetch Idempotency & Cross-reference
    const idempotencyRef = db.collection('idempotencyKeys').doc(idempotencyKey);
    const idempotencyDoc = await idempotencyRef.get();
    if (!idempotencyDoc.exists) {
      return NextResponse.json({ error: 'Idempotency key not found. Request rejected.' }, { status: 400 });
    }

    const idempotencyData = idempotencyDoc.data();
    if (idempotencyData?.status === 'completed') {
      return NextResponse.json(idempotencyData.response || { success: true });
    }

    if (idempotencyData?.amount !== pricePaise) {
      return NextResponse.json({ error: 'Payment amount mismatch. Potential tampering detected.' }, { status: 400 });
    }

    // Trigger checkout
    let result;
    try {
      result = await storeService.checkout(checkoutPayload);
    } catch (checkoutError: any) {
      console.error('Checkout processing failed after successful payment:', checkoutError);
      return NextResponse.json({
        success: false,
        error: `Post-payment registration failed: ${checkoutError.message || 'unknown error'}. Contact support with payment ID: ${razorpay_payment_id}`,
        razorpayPaymentId: razorpay_payment_id,
      }, { status: 400 });
    }

    await idempotencyRef.set({
      status: 'completed',
      response: result,
      razorpayPaymentId: razorpay_payment_id,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
