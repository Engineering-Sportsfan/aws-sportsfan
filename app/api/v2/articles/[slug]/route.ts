import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const slug = resolvedParams.slug;
    const doc = await db.collection('articles').doc(slug).get();
    if (!doc.exists) {
      return NextResponse.json({ error: `Article "${slug}" not found` }, { status: 404 });
    }
    return NextResponse.json({
      slug: doc.id,
      ...doc.data(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
