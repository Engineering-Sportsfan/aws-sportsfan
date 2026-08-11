// api/v2/playbook/[id]/drops/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const id = resolvedParams.id;
    
    let weekData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Query
    try {
      const queryRes = await docClient.send(new QueryCommand({
        TableName: 'SocialAndContent',
        KeyConditionExpression: 'contentId = :pk',
        ExpressionAttributeValues: { ':pk': `PLAYBOOK#${id}` }
      }));
      if (queryRes.Items && queryRes.Items.length > 0) {
        weekData = queryRes.Items[0];
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[V2 Playbook GET drops] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const doc = await db.collection('playbook').doc(id).get();
        if (doc.exists) {
          weekData = doc.data();
        }
      } catch (fsErr) {
        console.error('[V2 Playbook GET drops] Firestore fallback failed:', fsErr);
      }
    }

    const drops = weekData?.drops || [];
    return NextResponse.json(drops);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
