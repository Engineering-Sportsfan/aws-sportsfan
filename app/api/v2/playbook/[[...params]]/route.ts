// api/v2/playbook/[[...params]]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ params?: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const pathParams = resolvedParams.params || [];

    const getWeekFromDynamo = async (weekId: string) => {
      try {
        const queryRes = await docClient.send(new QueryCommand({
          TableName: 'SocialAndContent',
          KeyConditionExpression: 'contentId = :pk',
          ExpressionAttributeValues: { ':pk': `PLAYBOOK#${weekId}` }
        }));
        if (queryRes.Items && queryRes.Items.length > 0) {
          return { id: weekId, ...queryRes.Items[0] };
        }
      } catch (dynErr) {
        console.warn(`[V2 Playbook GET detail] DynamoDB query failed for ${weekId}:`, dynErr);
      }
      return null;
    };

    const getWeekFromFirestore = async (weekId: string) => {
      try {
        const doc = await db.collection('playbook').doc(weekId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
        }
      } catch (fsErr) {
        console.error(`[V2 Playbook GET detail] Firestore fallback failed for ${weekId}:`, fsErr);
      }
      return null;
    };

    if (pathParams.length === 0) {
      // GET /api/v2/playbook
      let list: any[] = [];
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB Scan
      try {
        const scanRes = await docClient.send(new ScanCommand({
          TableName: 'SocialAndContent',
          FilterExpression: 'begins_with(contentId, :p)',
          ExpressionAttributeValues: { ':p': 'PLAYBOOK#' }
        }));
        if (scanRes.Items && scanRes.Items.length > 0) {
          list = scanRes.Items.map((item) => ({
            id: (item.contentId as string).replace(/^PLAYBOOK#/, ''),
            ...item,
          }));
          list.sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn('[V2 Playbook GET list] DynamoDB scan failed:', dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo || list.length === 0) {
        try {
          const snapshot = await db.collection('playbook').orderBy('week').get();
          list = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
        } catch (fsErr) {
          console.error('[V2 Playbook GET list] Firestore fallback failed:', fsErr);
        }
      }

      return NextResponse.json(list);
    }

    const id = pathParams[0];

    if (pathParams.length === 1) {
      // GET /api/v2/playbook/:id
      let week = await getWeekFromDynamo(id);
      if (!week) {
        week = await getWeekFromFirestore(id);
      }
      if (!week) {
        return NextResponse.json({ error: `Playbook week ${id} not found` }, { status: 404 });
      }
      return NextResponse.json(week);
    }

    if (pathParams.length === 2 && pathParams[1] === 'drops') {
      // GET /api/v2/playbook/:id/drops
      let week: any = await getWeekFromDynamo(id);
      if (!week) {
        week = await getWeekFromFirestore(id);
      }
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
