import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const id = resolvedParams.id;
    const doc = await db.collection('playbook').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: `Playbook week ${id} not found` }, { status: 404 });
    }
    return NextResponse.json({
      id: doc.id,
      ...doc.data(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
