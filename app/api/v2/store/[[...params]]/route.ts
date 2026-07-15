import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';

const storeService = new StoreService(db);

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ params?: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const pathParams = resolvedParams.params || [];
    const { searchParams } = request.nextUrl;

    if (pathParams.length === 0) {
      return NextResponse.json({ error: 'Store root is not a valid endpoint' }, { status: 400 });
    }

    const firstSegment = pathParams[0];

    // 1. PRODUCTS
    if (firstSegment === 'products') {
      if (pathParams.length === 1) {
        // GET /api/v2/store/products?category=...&sport=...
        const category = searchParams.get('category') || undefined;
        const sport = searchParams.get('sport') || undefined;
        const products = await storeService.getProducts(category, sport);
        return NextResponse.json(products);
      }

      const productId = pathParams[1];

      if (pathParams.length === 2) {
        // GET /api/v2/store/products/:id
        const product = await storeService.getProductById(productId);
        return NextResponse.json(product);
      }

      if (pathParams.length === 3) {
        const subpath = pathParams[2];
        if (subpath === 'slots') {
          // GET /api/v2/store/products/:id/slots
          const slots = await storeService.getSlots(productId);
          return NextResponse.json(slots);
        }
        if (subpath === 'bids') {
          // GET /api/v2/store/products/:id/bids
          const bids = await storeService.getBids(productId);
          return NextResponse.json(bids);
        }
      }
    }

    // 2. USERS
    if (firstSegment === 'users' && pathParams.length >= 3) {
      const userId = pathParams[1];
      const subpath = pathParams[2];

      if (pathParams.length === 3) {
        if (subpath === 'orders') {
          // GET /api/v2/store/users/:userId/orders?category=...
          const category = searchParams.get('category') || undefined;
          const orders = await storeService.getUserOrders(userId, category);
          return NextResponse.json(orders);
        }
        if (subpath === 'session-requests') {
          // GET /api/v2/store/users/:userId/session-requests
          const requests = await storeService.getSessionRequests(userId);
          return NextResponse.json(requests);
        }
        if (subpath === 'wishlist') {
          // GET /api/v2/store/users/:userId/wishlist
          const wishlist = await storeService.getWishlist(userId);
          return NextResponse.json(wishlist);
        }
        if (subpath === 'recently-viewed') {
          // GET /api/v2/store/users/:userId/recently-viewed
          const recently = await storeService.getRecentlyViewed(userId);
          return NextResponse.json(recently);
        }
        if (subpath === 'membership') {
          // GET /api/v2/store/users/:userId/membership
          const membership = await storeService.getUserMembership(userId);
          return NextResponse.json(membership);
        }
      }

      if (pathParams.length === 4) {
        const leaf = pathParams[3];
        if (subpath === 'wallet') {
          if (leaf === 'balance') {
            // GET /api/v2/store/users/:userId/wallet/balance
            const balance = await storeService.getWalletBalance(userId);
            return NextResponse.json({ balancePaise: balance });
          }
          if (leaf === 'transactions') {
            // GET /api/v2/store/users/:userId/wallet/transactions
            const txs = await storeService.getWalletTransactions(userId);
            return NextResponse.json(txs);
          }
        }
        if (subpath === 'coins') {
          if (leaf === 'balance') {
            // GET /api/v2/store/users/:userId/coins/balance
            const balance = await storeService.getCoinsBalance(userId);
            return NextResponse.json({ balance });
          }
          if (leaf === 'transactions') {
            // GET /api/v2/store/users/:userId/coins/transactions
            const txs = await storeService.getCoinsTransactions(userId);
            return NextResponse.json(txs);
          }
        }
      }
    }

    // 3. ORDERS
    if (firstSegment === 'orders' && pathParams.length === 3) {
      const orderId = pathParams[1];
      const subpath = pathParams[2];
      const userId = searchParams.get('userId') || 'abhishekrt959_gmail_com';

      if (subpath === 'experience') {
        // GET /api/v2/store/orders/:orderId/experience?userId=...
        const order = await storeService.getExperienceOrderById(orderId, userId);
        return NextResponse.json(order);
      }
      if (subpath === 'event-pass') {
        // GET /api/v2/store/orders/:orderId/event-pass?userId=...
        const pass = await storeService.getEventPass(orderId, userId);
        return NextResponse.json(pass);
      }
    }

    // 4. EVENTS
    if (firstSegment === 'events' && pathParams.length === 3) {
      const action = pathParams[1];
      const token = pathParams[2];

      if (action === 'checkin') {
        // GET /api/v2/store/events/checkin/:qrToken
        const order = await storeService.findOrderByQrToken(token);
        if (!order) {
          return NextResponse.json({ error: 'Booking order not found for this QR token' }, { status: 404 });
        }
        if (order.status !== 'upcoming') {
          return NextResponse.json({ error: `Order is not active (current status: ${order.status})` }, { status: 400 });
        }
        if (order.eventMode !== 'offline') {
          return NextResponse.json({ error: 'This check-in link is for offline/in-person events only' }, { status: 400 });
        }
        if (order.checkedIn === true) {
          return NextResponse.json({ error: 'Attendee has already checked in for this event' }, { status: 400 });
        }

        await storeService.markCheckedIn(order.orderId, order.userId);
        const user = await storeService.getUserDetails(order.userId);

        return NextResponse.json({
          success: true,
          message: 'Check-in successful!',
          attendee: {
            userId: order.userId,
            firstName: user?.firstName || 'Mock',
            lastName: user?.lastName || 'User',
            email: user?.email || '',
          },
          event: {
            title: order.title,
            eventDate: order.eventDate || '',
            eventMode: order.eventMode,
          },
        });
      }

      if (action === 'join') {
        // GET /api/v2/store/events/join/:joinToken
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

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ params?: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const pathParams = resolvedParams.params || [];
    const body = await request.json().catch(() => ({}));

    if (pathParams.length === 0) {
      return NextResponse.json({ error: 'Store root is not a valid endpoint' }, { status: 400 });
    }

    const firstSegment = pathParams[0];

    // 1. CHECKOUT
    if (firstSegment === 'checkout') {
      // POST /api/v2/store/checkout
      const activeUserId = body.userId || 'mock-user-123';
      const result = await storeService.checkout({
        ...body,
        userId: activeUserId,
      });
      return NextResponse.json(result);
    }

    // 2. SESSION REQUESTS
    if (firstSegment === 'session-requests') {
      // POST /api/v2/store/session-requests
      const result = await storeService.createSessionRequest(body);
      return NextResponse.json(result);
    }

    // 3. PRODUCTS
    if (firstSegment === 'products') {
      if (pathParams.length === 1) {
        // POST /api/v2/store/products
        const result = await storeService.createProduct(body);
        return NextResponse.json(result);
      }

      const productId = pathParams[1];

      if (pathParams.length === 3 && pathParams[2] === 'bids') {
        // POST /api/v2/store/products/:id/bids
        const activeUserId = body.userId || 'mock-user-123';
        const amountPaise = Number(body.amountPaise);
        const result = await storeService.placeBid(productId, amountPaise, activeUserId);
        return NextResponse.json(result);
      }

      if (pathParams.length === 5 && pathParams[2] === 'slots') {
        const slotId = pathParams[3];
        const action = pathParams[4];
        const activeUserId = body.userId || 'mock-user-123';

        if (action === 'lock') {
          // POST /api/v2/store/products/:id/slots/:slotId/lock
          const result = await storeService.lockSlot(productId, slotId, activeUserId);
          return NextResponse.json(result);
        }
        if (action === 'unlock') {
          // POST /api/v2/store/products/:id/slots/:slotId/unlock
          const result = await storeService.unlockSlot(productId, slotId, activeUserId);
          return NextResponse.json(result);
        }
      }
    }

    // 4. USERS
    if (firstSegment === 'users' && pathParams.length === 3) {
      const userId = pathParams[1];
      const subpath = pathParams[2];

      if (subpath === 'wishlist') {
        // POST /api/v2/store/users/:userId/wishlist
        const productId = body.productId;
        const action = body.action || 'add';
        const result = await storeService.toggleWishlist(userId, productId, action);
        return NextResponse.json(result);
      }

      if (subpath === 'recently-viewed') {
        // POST /api/v2/store/users/:userId/recently-viewed
        const productId = body.productId;
        const result = await storeService.addRecentlyViewed(userId, productId);
        return NextResponse.json(result);
      }

      if (subpath === 'membership') {
        // POST /api/v2/store/users/:userId/membership
        const tier = body.tier;
        const result = await storeService.updateUserMembership(userId, tier);
        return NextResponse.json(result);
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
