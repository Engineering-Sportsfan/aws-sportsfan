// api/cron/session-reminders/route.ts
// STUB — no scheduler is wired to this endpoint yet.
// When a cron trigger is added, this handler will:
//   1. Query upcoming sessions within the reminder window (e.g. 24 h)
//   2. POST /api/notifications/store with notificationType: "store.session_reminder"
//      for each session participant.
//
// To activate: set a Vercel Cron job or EventBridge rule to call this endpoint.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  // TODO: implement session-reminder scanning logic here.
  // Example shape for each upcoming session found:
  //
  // await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notifications/store`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     userId: session.userId,
  //     notificationType: 'store.session_reminder',
  //     category: session.category === 'experiences' ? 'experiences' : 'coaches',
  //     title: 'Upcoming Session Reminder',
  //     variables: {
  //       expert_name: session.coachName || session.expertName || 'Expert',
  //       session_date: session.scheduledAt || 'TBD',
  //     },
  //     ctaTarget: `/store/session-requests/${session.id}`,
  //   }),
  // });

  return NextResponse.json({ success: true, message: 'Session reminder cron — not yet wired to a scheduler.' });
}
