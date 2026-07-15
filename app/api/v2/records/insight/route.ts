import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { GAP_ANALYSIS } from '../gapAnalysis';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const event = searchParams.get('event') || '';
    const category = searchParams.get('category') || '';

    // getRecords logic
    const key = `${event}_${category}`;
    const docRecords = await db.collection('records').doc(key).get();
    const records = docRecords.exists ? (docRecords.data()?.records || []) : [];

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
