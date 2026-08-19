// api/v2/records/[[...params]]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { QueryCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { GAP_ANALYSIS } from '../gapAnalysis';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ params?: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const pathParams = resolvedParams.params || [];
    const { searchParams } = request.nextUrl;

    const getRecords = async (event: string, category: string) => {
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
        console.warn(`[V2 Records getRecords] DynamoDB query failed for ${key}:`, dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection('records').doc(key).get();
          if (doc.exists) {
            records = doc.data()?.records ?? [];
          }
        } catch (fsErr) {
          console.error(`[V2 Records getRecords] Firestore fallback failed for ${key}:`, fsErr);
        }
      }

      return records;
    };

    if (pathParams.length === 0) {
      // GET /api/v2/records?event=100m&category=Men
      const event = searchParams.get('event') || '';
      const category = searchParams.get('category') || '';
      const records = await getRecords(event, category);
      return NextResponse.json(records);
    }

    const subpath = pathParams[0];

    if (pathParams.length === 1) {
      switch (subpath) {
        case 'insight': {
          // GET /api/v2/records/insight?event=100m&category=Men
          const event = searchParams.get('event') || '';
          const category = searchParams.get('category') || '';
          const records = await getRecords(event, category);

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
          const key = `${event}_${category}`;
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
        }
        case 'trends': {
          // GET /api/v2/records/trends?event=100m
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
            console.warn(`[V2 Records trends] DynamoDB query failed for ${event}:`, dynErr);
          }

          // 2. Fallback to Firestore
          if (!fetchedFromDynamo) {
            try {
              const doc = await db.collection('recordTrends').doc(event).get();
              trends = doc.exists ? (doc.data()?.trends || []) : [];
            } catch (fsErr) {
              console.error(`[V2 Records trends] Firestore fallback failed for ${event}:`, fsErr);
            }
          }

          return NextResponse.json(trends);
        }
        case 'progress': {
          // GET /api/v2/records/progress?event=100m
          const event = searchParams.get('event') || '';
          let progressData: any = null;
          let fetchedFromDynamo = false;

          // 1. Try DynamoDB (try PK = "UNKNOWN" first, fallback to PK = "USER#UNKNOWN")
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
            console.warn(`[V2 Records progress] DynamoDB get failed for ${event}:`, dynErr);
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
              console.error(`[V2 Records progress] Firestore fallback failed for ${event}:`, fsErr);
            }
          }

          return NextResponse.json(progressData || { gapData: [], milestones: [] });
        }
        case 'stories': {
          // GET /api/v2/records/stories
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
            console.warn('[V2 Records stories] DynamoDB scan failed:', dynErr);
          }

          // 2. Fallback to Firestore
          if (!fetchedFromDynamo || stories.length === 0) {
            try {
              const snapshot = await db.collection('recordStories').get();
              stories = snapshot.docs.map((doc) => doc.data());
            } catch (fsErr) {
              console.error('[V2 Records stories] Firestore fallback failed:', fsErr);
            }
          }

          return NextResponse.json(stories);
        }
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
