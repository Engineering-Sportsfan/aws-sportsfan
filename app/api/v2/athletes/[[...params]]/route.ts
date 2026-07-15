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
      // GET /api/v2/athletes
      const snapshot = await db.collection('athletesProfile').get();
      const athletes = snapshot.docs.map((doc) => ({
        slug: doc.id,
        ...doc.data(),
      }));
      return NextResponse.json(athletes);
    }

    const slug = pathParams[0];

    // Helper to get athlete by slug
    const getAthleteBySlug = async (athleteSlug: string) => {
      const doc = await db.collection('athletesProfile').doc(athleteSlug).get();
      if (!doc.exists) return null;
      return { slug: doc.id, ...doc.data() };
    };

    if (pathParams.length === 1) {
      // GET /api/v2/athletes/:slug
      const athlete = await getAthleteBySlug(slug);
      if (!athlete) {
        return NextResponse.json({ error: `Athlete ${slug} not found` }, { status: 404 });
      }
      return NextResponse.json(athlete);
    }

    if (pathParams.length === 2) {
      const subpath = pathParams[1];
      const athlete: any = await getAthleteBySlug(slug);
      
      switch (subpath) {
        case 'posts':
          // GET /api/v2/athletes/:slug/posts
          return NextResponse.json(athlete?.postsContent ?? []);
        case 'videos':
          // GET /api/v2/athletes/:slug/videos
          return NextResponse.json(athlete?.videosContent ?? []);
        case 'drops':
          // GET /api/v2/athletes/:slug/drops
          return NextResponse.json(athlete?.dropsContent ?? []);
        case 'highlights':
          // GET /api/v2/athletes/:slug/highlights
          return NextResponse.json(athlete?.highlights ?? []);
        default:
          break;
      }
    }

    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
