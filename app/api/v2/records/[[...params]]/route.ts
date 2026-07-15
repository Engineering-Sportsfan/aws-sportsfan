import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { GAP_ANALYSIS } from '../gapAnalysis';

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
      const doc = await db.collection('records').doc(key).get();
      if (!doc.exists) return [];
      const data = doc.data();
      return data?.records ?? [];
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
          const doc = await db.collection('recordTrends').doc(event).get();
          const trends = doc.exists ? (doc.data()?.trends || []) : [];
          return NextResponse.json(trends);
        }
        case 'progress': {
          // GET /api/v2/records/progress?event=100m
          const event = searchParams.get('event') || '';
          const doc = await db.collection('recordProgress').doc(event).get();
          if (!doc.exists) {
            return NextResponse.json({ gapData: [], milestones: [] });
          }
          const data = doc.data();
          return NextResponse.json({
            gapData: data?.gapData ?? [],
            milestones: data?.milestones ?? [],
          });
        }
        case 'stories': {
          // GET /api/v2/records/stories
          const snapshot = await db.collection('recordStories').get();
          const stories = snapshot.docs.map((doc) => doc.data());
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
