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
    const txs = await storeService.getCoinsTransactions(userId);
    return NextResponse.json(txs);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
