import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';

const storeService = new StoreService(db);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const activeUserId = body.userId || 'mock-user-123';
    const result = await storeService.checkout({
      ...body,
      userId: activeUserId,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}

