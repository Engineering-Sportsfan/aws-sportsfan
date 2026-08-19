// api/v2/records/progress/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const event = searchParams.get('event') || '';

    let progressData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB
    try {
      let getRes = await docClient.send(new GetCommand({
        TableName: 'GamificationAndWallet',
        Key: { userId: 'UNKNOWN', sk: `PROGRESS_RECORD#${event}` }
      }));
      if (!getRes.Item) {
        getRes = await docClient.send(new GetCommand({
          TableName: 'GamificationAndWallet',
          Key: { userId: 'USER#UNKNOWN', sk: `PROGRESS_RECORD#${event}` }
        }));
      }
      if (getRes.Item) {
        progressData = {
          gapData: getRes.Item.gapData ?? [],
          milestones: getRes.Item.milestones ?? []
        };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn(`[V2 Records progress GET] DynamoDB get failed for ${event}:`, dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const doc = await db.collection('recordProgress').doc(event).get();
        if (doc.exists) {
          const data = doc.data();
          progressData = {
            gapData: data?.gapData ?? [],
            milestones: data?.milestones ?? [],
          };
        }
      } catch (fsErr) {
        console.error(`[V2 Records progress GET] Firestore fallback failed for ${event}:`, fsErr);
      }
    }

    return NextResponse.json(progressData || { gapData: [], milestones: [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
