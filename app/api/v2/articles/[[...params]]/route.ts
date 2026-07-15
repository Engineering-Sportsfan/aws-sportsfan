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
      // GET /api/v2/articles
      const snapshot = await db.collection('articles').get();
      const articles = snapshot.docs.map((doc) => ({
        slug: doc.id,
        heroImage: doc.data().heroImage,
        title: doc.data().title,
        author: doc.data().author,
        readTime: doc.data().readTime,
        date: doc.data().date,
        likeCount: doc.data().likeCount,
        commentCount: doc.data().commentCount,
      }));
      return NextResponse.json(articles);
    } else if (pathParams.length === 1) {
      // GET /api/v2/articles/:slug
      const slug = pathParams[0];
      const doc = await db.collection('articles').doc(slug).get();
      if (!doc.exists) {
        return NextResponse.json({ error: `Article "${slug}" not found` }, { status: 404 });
      }
      return NextResponse.json({
        slug: doc.id,
        ...doc.data(),
      });
    }

    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
