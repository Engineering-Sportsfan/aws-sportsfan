import { NextResponse } from 'next/server';
import { runMembershipMigration } from '../membership-durationDays';

export async function POST() {
  try {
    const result = await runMembershipMigration();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Migration failed' }, { status: 500 });
  }
}
