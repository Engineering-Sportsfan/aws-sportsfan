// api/v2/records/stories/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    let stories: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: 'SocialAndContent',
        FilterExpression: 'begins_with(contentId, :p)',
        ExpressionAttributeValues: { ':p': 'RECORD_STORY#' }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        stories = scanRes.Items;
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[V2 Records stories GET] DynamoDB scan failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || stories.length === 0) {
      try {
        const snapshot = await db.collection('recordStories').get();
        stories = snapshot.docs.map((doc) => doc.data());
      } catch (fsErr) {
        console.error('[V2 Records stories GET] Firestore fallback failed:', fsErr);
      }
    }

    return NextResponse.json(stories);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
