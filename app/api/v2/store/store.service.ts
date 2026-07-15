import { BadRequestException, NotFoundException } from '@/lib/exceptions';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';

export class StoreService {
  constructor(
    private readonly db: Firestore,
  ) {}

  // ==========================================
  // CATALOG & PRODUCTS (Phase 1 & 4)
  // ==========================================

  async getProducts(category?: string, sport?: string) {
    let query: any = this.db.collection('storeProducts');

    if (category) {
      query = query.where('category', '==', category);
    }
    if (sport) {
      query = query.where('sport', '==', sport);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async getProductById(id: string) {
    const doc = await this.db.collection('storeProducts').doc(id).get();
    if (!doc.exists) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return {
      id: doc.id,
      ...doc.data(),
    };
  }

  async createProduct(payload: any) {
    const productId = randomUUID();
    const docRef = this.db.collection('storeProducts').doc(productId);
    await docRef.set({
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { id: productId, success: true };
  }

  // ==========================================
  // BOOKING ENGINE (Phase 2)
  // ==========================================

  async getSlots(productId: string) {
    const snapshot = await this.db
      .collection('storeProducts')
      .doc(productId)
      .collection('slots')
      .get();

    const now = new Date();
    const slots: any[] = [];
    const batch = this.db.batch();
    let hasUpdates = false;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const lockExpiresAt = data.lockExpiresAt ? (data.lockExpiresAt.toDate ? data.lockExpiresAt.toDate() : new Date(data.lockExpiresAt)) : null;

      if (data.status === 'locked' && lockExpiresAt && lockExpiresAt < now) {
        const docRef = doc.ref;
        batch.update(docRef, {
          status: 'available',
          lockedBy: null,
          lockExpiresAt: null,
        });
        slots.push({
          id: doc.id,
          ...data,
          status: 'available',
          lockedBy: null,
          lockExpiresAt: null,
        });
        hasUpdates = true;
      } else {
        slots.push({
          id: doc.id,
          ...data,
        });
      }
    }

    if (hasUpdates) {
      await batch.commit();
    }

    return slots;
  }

  async lockSlot(productId: string, slotId: string, userId: string) {
    const slotRef = this.db
      .collection('storeProducts')
      .doc(productId)
      .collection('slots')
      .doc(slotId);

    return await this.db.runTransaction(async (transaction) => {
      const slotDoc = await transaction.get(slotRef);
      if (!slotDoc.exists) {
        throw new NotFoundException('Slot not found');
      }

      const slotData = slotDoc.data();
      if (!slotData) {
        throw new BadRequestException('Slot data is empty');
      }
      const now = new Date();

      if (
        slotData.status === 'locked' &&
        slotData.lockExpiresAt &&
        slotData.lockExpiresAt.toDate() > now &&
        slotData.lockedBy !== userId
      ) {
        throw new BadRequestException('Slot is already locked by another user');
      }

      if (slotData.status === 'booked') {
        throw new BadRequestException('Slot is already booked');
      }

      const lockDurationMs = 2 * 60 * 1000; // 2 minutes
      const lockExpiresAt = new Date(now.getTime() + lockDurationMs);

      transaction.update(slotRef, {
        status: 'locked',
        lockedBy: userId,
        lockExpiresAt: lockExpiresAt,
      });

      return {
        slotId,
        status: 'locked',
        lockExpiresAt,
      };
    });
  }

  async unlockSlot(productId: string, slotId: string, userId: string) {
    const slotRef = this.db
      .collection('storeProducts')
      .doc(productId)
      .collection('slots')
      .doc(slotId);

    return await this.db.runTransaction(async (transaction) => {
      const slotDoc = await transaction.get(slotRef);
      if (!slotDoc.exists) {
        throw new NotFoundException('Slot not found');
      }

      const slotData = slotDoc.data();
      if (!slotData) return { success: true };

      if (slotData.status === 'locked' && slotData.lockedBy === userId) {
        transaction.update(slotRef, {
          status: 'available',
          lockedBy: null,
          lockExpiresAt: null,
        });
      }

      return { success: true };
    });
  }

  // ==========================================
  // AUCTION & BIDDING ENGINE (Phase 6)
  // ==========================================

  async getBids(productId: string) {
    const snapshot = await this.db
      .collection('storeProducts')
      .doc(productId)
      .collection('bids')
      .orderBy('amountPaise', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async placeBid(productId: string, amountPaise: number, userId: string) {
    const productRef = this.db.collection('storeProducts').doc(productId);

    return await this.db.runTransaction(async (transaction) => {
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists) {
        throw new NotFoundException('Auction not found');
      }

      const product = productDoc.data();
      if (!product) {
        throw new BadRequestException('Auction product data is empty');
      }

      const currentBidPaise = product.pricePaise || product.currentBidPaise || 0;
      if (amountPaise <= currentBidPaise) {
        throw new BadRequestException(`Bid must be greater than current bid: ${currentBidPaise}`);
      }

      // Check sniping
      const now = new Date();
      let endsAt = product.endsAt ? product.endsAt.toDate() : new Date(now.getTime() + 86400 * 1000);

      if (endsAt.getTime() < now.getTime()) {
        throw new BadRequestException('Auction has already ended');
      }

      const timeRemainingMs = endsAt.getTime() - now.getTime();
      const fiveMinutesMs = 5 * 60 * 1000;
      let extended = false;

      if (timeRemainingMs < fiveMinutesMs) {
        endsAt = new Date(now.getTime() + fiveMinutesMs);
        extended = true;
      }

      // Record the bid
      const bidId = randomUUID();
      const bidRef = productRef.collection('bids').doc(bidId);
      transaction.set(bidRef, {
        userId,
        amountPaise,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Update product current bid
      transaction.update(productRef, {
        pricePaise: amountPaise,
        currentBidPaise: amountPaise,
        biddersCount: FieldValue.increment(1),
        endsAt: endsAt,
      });

      return {
        success: true,
        currentBidPaise: amountPaise,
        endsAt,
        extended,
      };
    });
  }

  // ==========================================
  // ORDERS, PAYMENTS & WALLET (Phase 3)
  // ==========================================

  async getWalletBalance(userId: string): Promise<number> {
    const snapshot = await this.db
      .collection('wallet_transactions')
      .where('userId', '==', userId)
      .get();

    let balance = 0;
    snapshot.docs.forEach((doc) => {
      const tx = doc.data();
      if (tx.type === 'credit') {
        balance += tx.amountPaise;
      } else if (tx.type === 'debit') {
        balance -= tx.amountPaise;
      }
    });

    return balance;
  }

  async getWalletTransactions(userId: string) {
    const snapshot = await this.db
      .collection('wallet_transactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async getCoinsBalance(userId: string): Promise<number> {
    const snapshot = await this.db
      .collection('reward_coins_ledger')
      .where('userId', '==', userId)
      .get();

    let balance = 0;
    snapshot.docs.forEach((doc) => {
      const tx = doc.data();
      if (tx.type === 'credit') {
        balance += tx.amount || 0;
      } else if (tx.type === 'debit') {
        balance -= tx.amount || 0;
      }
    });

    return balance;
  }

  async getCoinsTransactions(userId: string) {
    const snapshot = await this.db
      .collection('reward_coins_ledger')
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async checkout(checkoutDto: {
    productId: string;
    slotId?: string;
    userId: string;
    paymentMethod: 'upi' | 'gpay' | 'phonepe' | 'paytm' | 'card' | 'wallet';
    pricePaise: number;
    idempotencyKey: string;
  }) {
    const { productId, slotId, userId, paymentMethod, pricePaise, idempotencyKey } = checkoutDto;

    const idempotencyRef = this.db.collection('idempotencyKeys').doc(idempotencyKey);

    return await this.db.runTransaction(async (transaction) => {
      // 1. Check idempotency
      const idempotencyDoc = await transaction.get(idempotencyRef);
      if (idempotencyDoc.exists) {
        const data = idempotencyDoc.data();
        return data ? data.response : null;
      }

      // 2. Fetch product details
      const productRef = this.db.collection('storeProducts').doc(productId);
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists) {
        throw new NotFoundException('Product not found');
      }
      const product = productDoc.data();
      if (!product) {
        throw new BadRequestException('Product data is empty');
      }

      // 3. Create global order record
      const orderId = randomUUID();
      let eventDate: string | null = null;

      // 4. If booking a coach session slot, check and claim slot
      if (slotId) {
        const slotRef = productRef.collection('slots').doc(slotId);
        const slotDoc = await transaction.get(slotRef);
        if (!slotDoc.exists) {
          throw new NotFoundException('Slot not found');
        }
        const slot = slotDoc.data();
        if (!slot) {
          throw new BadRequestException('Slot data is empty');
        }
        if (slot.status === 'booked') {
          throw new BadRequestException('Slot is already booked');
        }
        if (slot.date && slot.time) {
          try {
            const [time, modifier] = slot.time.split(' ');
            let [hours, minutes] = time.split(':').map(Number);
            if (modifier === 'PM' && hours < 12) hours += 12;
            if (modifier === 'AM' && hours === 12) hours = 0;
            const hh = String(hours).padStart(2, '0');
            const mm = String(minutes).padStart(2, '0');
            eventDate = `${slot.date}T${hh}:${mm}:00Z`;
          } catch (e) {
            eventDate = `${slot.date}T00:00:00Z`;
          }
        }
        const now = new Date();
        if (slot.status === 'locked' && slot.lockExpiresAt) {
          const expiresAt = slot.lockExpiresAt.toDate ? slot.lockExpiresAt.toDate() : new Date(slot.lockExpiresAt);
          if (expiresAt < now) {
            throw new BadRequestException('Slot lock has expired');
          }
          if (slot.lockedBy !== userId) {
            throw new BadRequestException('Slot is locked by another user');
          }
        }
        transaction.update(slotRef, {
          status: 'booked',
          bookedBy: userId,
          orderId: orderId,
        });
      }

      if ((product.category === 'experience' || product.category === 'experiences') && !slotId) {
        const seatsBooked = product.seatsBooked || 0;
        const totalSeats = product.totalSeats || 0;
        if (seatsBooked >= totalSeats) {
          throw new BadRequestException('No seats left');
        }
        transaction.update(productRef, {
          seatsBooked: seatsBooked + 1,
        });
      }

      if (!eventDate && product.date) {
        eventDate = product.date;
      }
      if (!eventDate && product.eventStartsAt) {
        eventDate = product.eventStartsAt;
      }

      // 5. If payment method is Wallet, check and deduct balance
      if (paymentMethod === 'wallet') {
        const currentBalance = await this.getWalletBalance(userId);
        if (currentBalance < pricePaise) {
          throw new BadRequestException('Insufficient wallet balance');
        }

        const walletTxRef = this.db.collection('wallet_transactions').doc(randomUUID());
        transaction.set(walletTxRef, {
          userId,
          amountPaise: pricePaise,
          type: 'debit',
          description: `Purchase: ${product.title || product.name}`,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Record non-wallet payment in wallet transactions history
        const walletTxRef = this.db.collection('wallet_transactions').doc(randomUUID());
        transaction.set(walletTxRef, {
          userId,
          amountPaise: pricePaise,
          type: 'debit',
          description: `Purchase (${paymentMethod.toUpperCase()}): ${product.title || product.name}`,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Generate secure QR/join token if it's an event or online experience
      const qrToken = randomUUID();
      const isOnlineEvent = (product.category === 'events' && product.type === 'virtual') ||
                            ((product.category === 'experience' || product.category === 'experiences') && product.type === 'online');
      const joinToken = isOnlineEvent ? randomUUID() : null;

      const orderRef = this.db.collection('storeOrders').doc(orderId);
      const initialStatus = product.category === 'digital' ? 'completed' : 'upcoming';
      const orderData: any = {
        orderId,
        userId,
        productId,
        productType: product.category || 'general',
        slotId: slotId || null,
        title: product.title || product.name,
        pricePaise,
        paymentMethod,
        status: initialStatus,
        eventDate: eventDate,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (product.category === 'events') {
        orderData.qrToken = qrToken;
        orderData.eventMode = product.type === 'virtual' ? 'online' : 'offline';
        orderData.checkedIn = false;
        orderData.checkedInAt = null;
        if (joinToken) {
          orderData.joinToken = joinToken;
        }
      }

      if (product.category === 'experience' || product.category === 'experiences') {
        orderData.eventPassToken = randomUUID();
        if (product.type === 'online') {
          orderData.qrToken = qrToken;
          orderData.eventMode = 'online';
          orderData.checkedIn = false;
          orderData.checkedInAt = null;
          if (joinToken) {
            orderData.joinToken = joinToken;
          }
        }
      }

      transaction.set(orderRef, orderData);

      // 6. Denormalize copy for fast user queries
      const userOrderRef = this.db
        .collection('users')
        .doc(userId)
        .collection('orders')
        .doc(orderId);
      transaction.set(userOrderRef, orderData);

      // 7. Write revenue splits
      const splitId = randomUUID();
      const splitRef = this.db.collection('revenue_splits').doc(splitId);
      
      const platformFee = Math.round(pricePaise * 0.15); // 15% Platform
      const afiRoyalty = product.governance_state === 'approved' ? Math.round(pricePaise * 0.10) : 0; // 10% AFI if approved
      const athleteShare = pricePaise - platformFee - afiRoyalty;

      transaction.set(splitRef, {
        orderId,
        pricePaise,
        platformFee,
        afiRoyalty,
        athleteShare,
        athleteId: product.athleteId || product.coachId || null,
        createdAt: FieldValue.serverTimestamp(),
      });

      // 9. Credit Reward Coins
      const rewardAmount = product.rewardCoins || 0;
      if (rewardAmount > 0) {
        const rewardLedgerId = randomUUID();
        const rewardLedgerRef = this.db.collection('reward_coins_ledger').doc(rewardLedgerId);
        transaction.set(rewardLedgerRef, {
          userId,
          amount: rewardAmount,
          type: 'credit',
          description: `Purchase Reward: ${product.title || product.name}`,
          createdAt: FieldValue.serverTimestamp(),
        });

        // 10. Write notification for rewards gained
        const notificationId = randomUUID();
        const notificationRef = this.db
          .collection('users')
          .doc(userId)
          .collection('notifications')
          .doc(notificationId);
        
        transaction.set(notificationRef, {
          id: notificationId,
          title: 'Rewards Gained!',
          message: `You earned ${rewardAmount} Reward Coins from purchasing "${product.title || product.name}"!`,
          type: 'reward',
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      const response = { orderId, success: true };

      // Save idempotency key response
      transaction.set(idempotencyRef, {
        response,
        createdAt: FieldValue.serverTimestamp(),
      });

      return response;
    });
  }

  async getUserOrders(userId: string, category?: string) {
    let query: any = this.db
      .collection('storeOrders')
      .where('userId', '==', userId);

    if (category) {
      query = query.where('productType', '==', category);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async getExperienceOrderById(orderId: string, userId: string) {
    const orderDoc = await this.db.collection('storeOrders').doc(orderId).get();
    if (!orderDoc.exists) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    const orderData = orderDoc.data();
    if (!orderData) {
      throw new BadRequestException('Order data is empty');
    }
    if (orderData.userId !== userId) {
      throw new BadRequestException('Order does not belong to user');
    }
    if (orderData.productType !== 'experience' && orderData.productType !== 'experiences') {
      throw new BadRequestException('Not an experience order');
    }

    const productDoc = await this.db.collection('storeProducts').doc(orderData.productId).get();
    const productData = productDoc.exists ? productDoc.data() : {};

    return {
      ...orderData,
      id: orderDoc.id,
      productDetails: productData,
    };
  }

  async getEventPass(orderId: string, userId: string) {
    const orderDoc = await this.db.collection('storeOrders').doc(orderId).get();
    if (!orderDoc.exists) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    const orderData = orderDoc.data();
    if (!orderData) {
      throw new BadRequestException('Order data is empty');
    }
    if (orderData.userId !== userId) {
      throw new BadRequestException('Order does not belong to user');
    }
    if (orderData.status === 'cancelled') {
      throw new BadRequestException('Order is cancelled');
    }

    const productDoc = await this.db.collection('storeProducts').doc(orderData.productId).get();
    const productData = (productDoc.exists ? productDoc.data() : {}) as any;

    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const participantName = userData ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim() : 'Guest';

    return {
      eventPassToken: orderData.eventPassToken || null,
      title: orderData.title || productData.title || '',
      athlete: productData.athlete || '',
      venue: productData.venue || null,
      onlineLink: productData.onlineLink || null,
      date: orderData.eventDate || productData.eventStartsAt || null,
      bookingId: orderData.orderId,
      participantName: participantName || 'Guest User',
      joinToken: orderData.joinToken || null,
    };
  }

  async createSessionRequest(payload: any) {
    const requestId = randomUUID();
    const docRef = this.db.collection('session_requests').doc(requestId);
    await docRef.set({
      ...payload,
      status: 'open',
      createdAt: FieldValue.serverTimestamp(),
    });
    return { id: requestId, success: true };
  }

  async getSessionRequests(userId: string) {
    const snapshot = await this.db
      .collection('session_requests')
      .where('userId', '==', userId)
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async getWishlist(userId: string) {
    const snapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection('wishlist')
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async toggleWishlist(userId: string, productId: string, action: 'add' | 'remove') {
    const docRef = this.db
      .collection('users')
      .doc(userId)
      .collection('wishlist')
      .doc(productId);

    if (action === 'remove') {
      await docRef.delete();
    } else {
      const productDoc = await this.db.collection('storeProducts').doc(productId).get();
      const productData = productDoc.exists ? productDoc.data() : {};
      await docRef.set({
        productId,
        title: productData?.title || productData?.name || 'Product',
        pricePaise: productData?.pricePaise || 0,
        image: productData?.image || '',
        category: productData?.category || 'general',
        addedAt: FieldValue.serverTimestamp(),
      });
    }
    return { success: true };
  }

  async getRecentlyViewed(userId: string) {
    const snapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection('recentlyViewed')
      .orderBy('viewedAt', 'desc')
      .limit(10)
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async addRecentlyViewed(userId: string, productId: string) {
    const docRef = this.db
      .collection('users')
      .doc(userId)
      .collection('recentlyViewed')
      .doc(productId);

    const productDoc = await this.db.collection('storeProducts').doc(productId).get();
    const productData = productDoc.exists ? productDoc.data() : {};

    await docRef.set({
      productId,
      title: productData?.title || productData?.name || 'Product',
      pricePaise: productData?.pricePaise || 0,
      image: productData?.image || '',
      category: productData?.category || 'general',
      viewedAt: FieldValue.serverTimestamp(),
    });
    return { success: true };
  }

  async getUserMembership(userId: string) {
    const userDoc = await this.db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data?.membership) {
        return data.membership;
      }
    }
    return {
      tier: 'quarterly',
      renewalDate: 'Oct 3, 2026',
      pricePaise: 119900,
      daysLeft: 92,
    };
  }

  async updateUserMembership(userId: string, tier: string) {
    let pricePaise = 49900;
    let daysLeft = 30;
    let renewalDate = new Date(Date.now() + 30 * 86400 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (tier === 'quarterly') {
      pricePaise = 119900;
      daysLeft = 92;
      renewalDate = new Date(Date.now() + 92 * 86400 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (tier === 'elite') {
      pricePaise = 399900;
      daysLeft = 365;
      renewalDate = new Date(Date.now() + 365 * 86400 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const membership = {
      tier,
      renewalDate,
      pricePaise,
      daysLeft,
    };

    await this.db.collection('users').doc(userId).set({ membership }, { merge: true });
    return membership;
  }

  async findOrderByQrToken(qrToken: string) {
    const snapshot = await this.db
      .collection('storeOrders')
      .where('qrToken', '==', qrToken)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data(),
    } as any;
  }

  async findOrderByJoinToken(joinToken: string) {
    const snapshot = await this.db
      .collection('storeOrders')
      .where('joinToken', '==', joinToken)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data(),
    } as any;
  }

  async markCheckedIn(orderId: string, userId: string) {
    const now = new Date();
    const orderRef = this.db.collection('storeOrders').doc(orderId);
    const userOrderRef = this.db
      .collection('users')
      .doc(userId)
      .collection('orders')
      .doc(orderId);

    const batch = this.db.batch();
    batch.update(orderRef, {
      checkedIn: true,
      checkedInAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.update(userOrderRef, {
      checkedIn: true,
      checkedInAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  async getUserDetails(userId: string) {
    const doc = await this.db.collection('users').doc(userId).get();
    if (!doc.exists) return null;
    return doc.data();
  }
}
