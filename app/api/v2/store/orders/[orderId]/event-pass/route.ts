import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';

const storeService = new StoreService(db);

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ orderId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const orderId = resolvedParams.orderId;
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId') || 'abhishekrt959_gmail_com';
    const pass = await storeService.getEventPass(orderId, userId);
    return NextResponse.json(pass);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
