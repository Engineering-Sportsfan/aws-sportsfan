import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const slug = resolvedParams.slug;
    const doc = await db.collection('athletesProfile').doc(slug).get();
    const videos = doc.exists ? (doc.data()?.videosContent || []) : [];
    return NextResponse.json(videos);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
