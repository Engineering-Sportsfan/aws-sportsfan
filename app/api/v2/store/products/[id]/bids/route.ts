import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';

const storeService = new StoreService(db);

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const productId = resolvedParams.id;
    const bids = await storeService.getBids(productId);
    return NextResponse.json(bids);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const productId = resolvedParams.id;
    const body = await request.json().catch(() => ({}));
    const activeUserId = body.userId || 'mock-user-123';
    const amountPaise = Number(body.amountPaise);

    const result = await storeService.placeBid(productId, amountPaise, activeUserId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
