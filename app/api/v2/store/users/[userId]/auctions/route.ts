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
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || 'current') as 'current' | 'previous' | 'won';

    const auctions = await storeService.getUserAuctions(userId, type);
    return NextResponse.json(auctions);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
