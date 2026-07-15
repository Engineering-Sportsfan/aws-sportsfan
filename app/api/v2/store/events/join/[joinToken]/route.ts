import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';

const storeService = new StoreService(db);

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ joinToken: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const token = resolvedParams.joinToken;

    const order = await storeService.findOrderByJoinToken(token);
    if (!order) {
      return NextResponse.json({ error: 'Booking order not found for this join token' }, { status: 404 });
    }
    if (order.status !== 'upcoming') {
      return NextResponse.json({ error: `Booking is not active (current status: ${order.status})` }, { status: 400 });
    }
    if (order.eventMode !== 'online') {
      return NextResponse.json({ error: 'This join link is for online events only' }, { status: 400 });
    }

    const mockMeetingUrl = `https://zoom.us/j/mock-meeting-${order.orderId.substring(0, 8)}`;
    return NextResponse.json({
      success: true,
      meetingUrl: mockMeetingUrl,
      event: {
        title: order.title,
        eventDate: order.eventDate || '',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
