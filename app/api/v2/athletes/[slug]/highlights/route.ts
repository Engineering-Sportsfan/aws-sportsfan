// api/v2/athletes/[slug]/highlights/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const slug = resolvedParams.slug;

    let athleteData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Get
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: 'SportsData',
        Key: { entityId: `ATHLETE#${slug}`, sk: 'PROFILE#META' }
      }));
      if (getRes.Item) {
        athleteData = getRes.Item;
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn(`[V2 Athlete GET highlights] DynamoDB get failed for ${slug}:`, dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const doc = await db.collection('athletesProfile').doc(slug).get();
        if (doc.exists) {
          athleteData = doc.data();
        }
      } catch (fsErr) {
        console.error(`[V2 Athlete GET highlights] Firestore fallback failed for ${slug}:`, fsErr);
      }
    }

    const highlights = athleteData?.highlights || [];
    return NextResponse.json(highlights);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
