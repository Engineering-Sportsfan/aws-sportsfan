// api/v2/records/insight/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GAP_ANALYSIS } from '../gapAnalysis';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const event = searchParams.get('event') || '';
    const category = searchParams.get('category') || '';

    // getRecords logic
    const key = `${event}_${category}`;
    let records: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Query
    try {
      const queryRes = await docClient.send(new QueryCommand({
        TableName: 'SocialAndContent',
        KeyConditionExpression: 'contentId = :pk',
        ExpressionAttributeValues: { ':pk': `RECORD#${key}` }
      }));
      if (queryRes.Items && queryRes.Items.length > 0) {
        records = queryRes.Items[0].records || [];
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn(`[V2 Records insight GET] DynamoDB query failed for ${key}:`, dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const docRecords = await db.collection('records').doc(key).get();
        records = docRecords.exists ? (docRecords.data()?.records || []) : [];
      } catch (fsErr) {
        console.error(`[V2 Records insight GET] Firestore fallback failed for ${key}:`, fsErr);
      }
    }

    const national = records.find((r: any) => r.type === 'National');
    const world = records.find((r: any) => r.type === 'World');

    if (!national || !world) {
      return NextResponse.json(null);
    }

    const isTimeEvent =
      event.includes('m') &&
      !event.includes('Jump') &&
      !event.includes('Throw') &&
      !event.includes('Put') &&
      !event.includes('Vault');

    const unit = isTimeEvent ? 's' : 'm';
    const diff = Math.abs(national.numericValue - world.numericValue);
    const percentage = ((diff / world.numericValue) * 100).toFixed(1);
    const formattedDiff = `${diff.toFixed(2)}${unit}`;

    // Gap analysis
    const gap = GAP_ANALYSIS[key];

    let gapReductionPercent = '0';
    let trendDirection = 'Insufficient data';
    let baselineYear = '—';
    let globalRank = 'N/A';

    if (gap) {
      const reduction =
        gap.baselineGap !== 0
          ? ((gap.gapChange / gap.baselineGap) * 100).toFixed(1)
          : '0';
      gapReductionPercent = reduction;
      trendDirection = gap.trendDirection;
      baselineYear = gap.baselineYear;
      globalRank = gap.globalRank;
    }

    const insight = {
      diff,
      percentage,
      formattedDiff,
      unit,
      gapReductionPercent,
      globalRank,
      trendDirection,
      baselineYear,
    };

    return NextResponse.json(insight);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
