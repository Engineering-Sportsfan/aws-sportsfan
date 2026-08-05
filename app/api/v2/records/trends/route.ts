// api/v2/records/trends/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const event = searchParams.get('event') || '';

    let trends: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Query
    try {
      const queryRes = await docClient.send(new QueryCommand({
        TableName: 'SocialAndContent',
        KeyConditionExpression: 'contentId = :pk',
        ExpressionAttributeValues: { ':pk': `RECORD_TREND#${event}` }
      }));
      if (queryRes.Items && queryRes.Items.length > 0) {
        trends = queryRes.Items[0].trends || [];
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn(`[V2 Records trends GET] DynamoDB query failed for ${event}:`, dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const doc = await db.collection('recordTrends').doc(event).get();
        trends = doc.exists ? (doc.data()?.trends || []) : [];
      } catch (fsErr) {
        console.error(`[V2 Records trends GET] Firestore fallback failed for ${event}:`, fsErr);
      }
    }

    return NextResponse.json(trends);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
