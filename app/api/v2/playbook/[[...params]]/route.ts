import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ params?: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const pathParams = resolvedParams.params || [];

    if (pathParams.length === 0) {
      // GET /api/v2/playbook
      const snapshot = await db
        .collection('playbook')
        .orderBy('week')
        .get();

      const weeks = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      return NextResponse.json(weeks);
    }

    const id = pathParams[0];

    const getWeek = async (weekId: string) => {
      const doc = await db.collection('playbook').doc(weekId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    };

    if (pathParams.length === 1) {
      // GET /api/v2/playbook/:id
      const week = await getWeek(id);
      if (!week) {
        return NextResponse.json({ error: `Playbook week ${id} not found` }, { status: 404 });
      }
      return NextResponse.json(week);
    }

    if (pathParams.length === 2 && pathParams[1] === 'drops') {
      // GET /api/v2/playbook/:id/drops
      const week: any = await getWeek(id);
      const drops = week?.drops ?? [];
      return NextResponse.json(drops);
    }

    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
