import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';

const storeService = new StoreService(db);

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ userId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const userId = resolvedParams.userId;
    const recently = await storeService.getRecentlyViewed(userId);
    return NextResponse.json(recently);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ userId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const userId = resolvedParams.userId;
    const body = await request.json().catch(() => ({}));
    const productId = body.productId;
    const result = await storeService.addRecentlyViewed(userId, productId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
