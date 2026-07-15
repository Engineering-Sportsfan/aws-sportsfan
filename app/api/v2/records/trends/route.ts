import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const event = searchParams.get('event') || '';

    const doc = await db.collection('recordTrends').doc(event).get();
    const trends = doc.exists ? (doc.data()?.trends || []) : [];

    return NextResponse.json(trends);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
