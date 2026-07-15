import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const event = searchParams.get('event') || '';

    const doc = await db.collection('recordProgress').doc(event).get();
    if (!doc.exists) {
      return NextResponse.json({ gapData: [], milestones: [] });
    }
    const data = doc.data();
    const progress = {
      gapData: data?.gapData ?? [],
      milestones: data?.milestones ?? [],
    };

    return NextResponse.json(progress);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
