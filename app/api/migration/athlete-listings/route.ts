import { NextRequest, NextResponse } from 'next/server';
import { migrateAthleteListings } from '../athlete-listings';

export async function POST(req: NextRequest) {
  try {
    const result = await migrateAthleteListings();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}
