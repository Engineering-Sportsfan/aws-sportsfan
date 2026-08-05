// api/v2/athletes/[[...params]]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ params?: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const pathParams = resolvedParams.params || [];

    const getAthleteBySlug = async (athleteSlug: string) => {
      let athlete: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB Get
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: 'SportsData',
          Key: { entityId: `ATHLETE#${athleteSlug}`, sk: 'PROFILE#META' }
        }));
        if (getRes.Item) {
          athlete = { slug: athleteSlug, ...getRes.Item };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn(`[V2 Athletes GET detail] DynamoDB get failed for ${athleteSlug}:`, dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection('athletesProfile').doc(athleteSlug).get();
          if (doc.exists) {
            athlete = { slug: doc.id, ...doc.data() };
          }
        } catch (fsErr) {
          console.error(`[V2 Athletes GET detail] Firestore fallback failed for ${athleteSlug}:`, fsErr);
        }
      }

      return athlete;
    };

    if (pathParams.length === 0) {
      // GET /api/v2/athletes
      let list: any[] = [];
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB Scan
      try {
        const scanRes = await docClient.send(new ScanCommand({
          TableName: 'SportsData',
          FilterExpression: 'begins_with(entityId, :p)',
          ExpressionAttributeValues: { ':p': 'ATHLETE#' }
        }));
        if (scanRes.Items && scanRes.Items.length > 0) {
          list = scanRes.Items.map((item) => ({
            slug: (item.entityId as string).replace(/^ATHLETE#/, ''),
            ...item,
          }));
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn('[V2 Athletes GET list] DynamoDB scan failed:', dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo || list.length === 0) {
        try {
          const snapshot = await db.collection('athletesProfile').get();
          list = snapshot.docs.map((doc) => ({
            slug: doc.id,
            ...doc.data(),
          }));
        } catch (fsErr) {
          console.error('[V2 Athletes GET list] Firestore fallback failed:', fsErr);
        }
      }

      return NextResponse.json(list);
    }

    const slug = pathParams[0];

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
