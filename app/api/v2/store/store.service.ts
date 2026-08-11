import { BadRequestException, NotFoundException } from '@/lib/exceptions';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { docClient } from '@/lib/dynamodb';
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export class StoreService {
  constructor(
    private readonly db: Firestore,
  ) {}

  // ==========================================
  // CATALOG & PRODUCTS (Phase 1 & 4)
  // ==========================================

  async getProducts(category?: string, sport?: string) {
    let products: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan first
    try {
      const expressionParts: string[] = ['begins_with(#eid, :pk)', 'begins_with(#sk, :pk)'];
      const ExpressionAttributeValues: Record<string, any> = { ':pk': 'PRODUCT#' };
      const ExpressionAttributeNames: Record<string, string> = { '#eid': 'entityId', '#sk': 'sk' };

      if (category) {
        const nc = category.toLowerCase() === 'auctions' ? 'Auctions' : category;
        expressionParts.push('category = :cat');
        ExpressionAttributeValues[':cat'] = nc;
        if (nc === 'Auctions') {
          expressionParts.push('governance_state = :gov', '#st = :stat');
          ExpressionAttributeValues[':gov'] = 'approved';
          ExpressionAttributeValues[':stat'] = 'active';
          ExpressionAttributeNames['#st'] = 'status';
        }
      }
      if (sport) {
        expressionParts.push('sport = :sport');
        ExpressionAttributeValues[':sport'] = sport;
      }

      const res = await docClient.send(new ScanCommand({
        TableName: 'StoreAndCommerce',
        FilterExpression: expressionParts.join(' AND '),
        ExpressionAttributeNames,
        ExpressionAttributeValues,
      }));

      if (res.Items && res.Items.length > 0) {
        products = res.Items.map(item => ({ id: (item.entityId as string).replace(/^PRODUCT#/, ''), ...item }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getProducts] DynamoDB scan failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        let query: any = this.db.collection('storeProducts');
        if (category) {
          const nc = category.toLowerCase() === 'auctions' ? 'Auctions' : category;
          query = query.where('category', '==', nc);
          if (nc === 'Auctions') {
            query = query.where('governance_state', '==', 'approved').where('status', '==', 'active');
          }
        }
        if (sport) query = query.where('sport', '==', sport);
        const snapshot = await query.get();
        products = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getProducts] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }

    const now = new Date();
    const finalProducts: any[] = [];

    for (let product of products) {
      product = await this.checkAndCloseAuctionInline(product.id ?? product.entityId?.replace(/^PRODUCT#/, ''), product);
      const lockExpiresAt = product.lockExpiresAt
        ? (product.lockExpiresAt.toDate ? product.lockExpiresAt.toDate() : new Date(product.lockExpiresAt))
        : null;

      if ((product.status === 'locked' || product.status === 'reserved') && lockExpiresAt && lockExpiresAt < now) {
        // Unlock in DynamoDB
        try {
          await docClient.send(new UpdateCommand({
            TableName: 'StoreAndCommerce',
            Key: { entityId: `PRODUCT#${product.id}`, sk: `PRODUCT#${product.id}` },
            UpdateExpression: 'SET #st = :av, lockedBy = :nul, lockExpiresAt = :nul',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: { ':av': 'available', ':nul': null },
          }));
        } catch (dynErr) {
          console.warn('[StoreService getProducts] DynamoDB unlock failed:', dynErr);
        }
        // Sync to Firestore
        try {
          await this.db.collection('storeProducts').doc(product.id).update({ status: 'available', lockedBy: null, lockExpiresAt: null });
        } catch (fsErr) {
          console.warn('[StoreService getProducts] Firestore unlock failed:', fsErr);
        }
        finalProducts.push({ ...product, status: 'available', lockedBy: null, lockExpiresAt: null });
      } else {
        finalProducts.push(product);
      }
    }

    return finalProducts;
  }

  private async checkAndCloseAuctionInline(productId: string, data: any): Promise<any> {
    const endsAt = data.endsAt ? (data.endsAt.toDate ? data.endsAt.toDate() : new Date(data.endsAt)) : null;
    const now = new Date();
    if (
      data.category === 'Auctions' &&
      data.status === 'active' &&
      endsAt &&
      endsAt <= now
    ) {
      console.log(`[checkAndCloseAuctionInline] Closing expired auction ${productId} inline.`);

      // 1. Fetch fresh data from DynamoDB
      let freshProduct = data;
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
        }));
        if (getRes.Item) freshProduct = getRes.Item;
      } catch (dynErr) {
        console.warn('[checkAndCloseAuctionInline] DynamoDB get failed, using cached data:', dynErr);
      }

      if (!freshProduct || freshProduct.status !== 'active') return freshProduct || data;

      const currentBidPaise = freshProduct.currentBidPaise || freshProduct.pricePaise || 0;
      const reservePrice = freshProduct.reservePrice || 0;
      const highestBidderId = freshProduct.highestBidderId || null;

      let finalStatus = 'reserve_not_met';
      let winnerId: string | null = null;
      let winnerPaymentStatus: string | null = null;
      let paymentDeadline: string | null = null;

      if (currentBidPaise >= reservePrice && highestBidderId) {
        if (highestBidderId === 'legacy_unclaimed') {
          finalStatus = 'unclaimed_reserve_met';
        } else {
          finalStatus = 'closed';
          winnerId = highestBidderId;
          winnerPaymentStatus = 'pending';
          const deadlineHours = freshProduct.paymentDeadlineHours || 24;
          paymentDeadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();
        }
      }

      const updateData: any = { status: finalStatus, winnerId };
      if (winnerPaymentStatus) updateData.winnerPaymentStatus = winnerPaymentStatus;
      if (paymentDeadline) updateData.paymentDeadline = paymentDeadline;

      // 2. Write to DynamoDB first
      try {
        let updateExpr = 'SET #st = :s, winnerId = :w';
        const exprVals: Record<string, any> = { ':s': finalStatus, ':w': winnerId };
        if (winnerPaymentStatus) { updateExpr += ', winnerPaymentStatus = :wps'; exprVals[':wps'] = winnerPaymentStatus; }
        if (paymentDeadline) { updateExpr += ', paymentDeadline = :pd'; exprVals[':pd'] = paymentDeadline; }

        await docClient.send(new UpdateCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
          UpdateExpression: updateExpr,
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: exprVals,
        }));

        if (winnerId) {
          const notifId = randomUUID();
          await docClient.send(new PutCommand({
            TableName: 'SocialAndContent',
            Item: {
              contentId: `USER#${winnerId}`,
              sk: `NOTIF#${notifId}`,
              id: notifId,
              title: 'You Won the Auction!',
              message: `Congratulations! You are the winner of "${freshProduct.title || freshProduct.name}" at ₹${currentBidPaise / 100}. Please complete payment within 24 hours.`,
              type: 'auction_win',
              isRead: false,
              createdAt: Date.now(),
            },
          }));
        }
      } catch (dynErr) {
        console.error(`[checkAndCloseAuctionInline] DynamoDB write failed for ${productId}:`, dynErr);
      }

      // 3. Sync to Firestore
      try {
        const productRef = this.db.collection('storeProducts').doc(productId);
        await productRef.update(updateData);
        if (winnerId) {
          const notifId = randomUUID();
          await this.db.collection('users').doc(winnerId).collection('notifications').doc(notifId).set({
            id: notifId,
            title: 'You Won the Auction!',
            message: `Congratulations! You are the winner of "${freshProduct.title || freshProduct.name}" at ₹${currentBidPaise / 100}. Please complete payment within 24 hours.`,
            type: 'auction_win',
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      } catch (fsErr) {
        console.warn(`[checkAndCloseAuctionInline] Firestore sync failed for ${productId}:`, fsErr);
      }

      return { ...freshProduct, ...updateData };
    }
    return data;
  }

  async getProductById(id: string) {
    let data: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` },
      }));
      if (res.Item) {
        data = { id, ...res.Item };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getProductById] DynamoDB get failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      const doc = await this.db.collection('storeProducts').doc(id).get();
      if (!doc.exists) throw new NotFoundException(`Product with ID ${id} not found`);
      data = { id: doc.id, ...doc.data() };
    }

    if (!data) throw new NotFoundException(`Product data is empty`);

    data = await this.checkAndCloseAuctionInline(id, data);
    if (!data) throw new NotFoundException(`Product data is empty`);

    const now = new Date();
    const lockExpiresAt = data.lockExpiresAt
      ? (data.lockExpiresAt.toDate ? data.lockExpiresAt.toDate() : new Date(data.lockExpiresAt))
      : null;

    if ((data.status === 'locked' || data.status === 'reserved') && lockExpiresAt && lockExpiresAt < now) {
      // Unlock in DynamoDB
      try {
        await docClient.send(new UpdateCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` },
          UpdateExpression: 'SET #st = :av, lockedBy = :nul, lockExpiresAt = :nul',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':av': 'available', ':nul': null },
        }));
      } catch (dynErr) {
        console.warn('[StoreService getProductById] DynamoDB unlock failed:', dynErr);
      }
      // Sync to Firestore
      try {
        await this.db.collection('storeProducts').doc(id).update({ status: 'available', lockedBy: null, lockExpiresAt: null });
      } catch (fsErr) {
        console.warn('[StoreService getProductById] Firestore unlock failed:', fsErr);
      }
      return { ...data, status: 'available', lockedBy: null, lockExpiresAt: null };
    }

    return data;
  }

  async createProduct(payload: any) {
    const productId = randomUUID();
    const now = Date.now();

    // 1. Write to DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: 'StoreAndCommerce',
        Item: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}`, ...payload, createdAt: now },
      }));
    } catch (dynErr) {
      console.warn('[StoreService createProduct] DynamoDB put failed:', dynErr);
    }

    // 2. Sync to Firestore
    try {
      await this.db.collection('storeProducts').doc(productId).set({ ...payload, createdAt: FieldValue.serverTimestamp() });
    } catch (fsErr) {
      console.warn('[StoreService createProduct] Firestore sync failed:', fsErr);
    }

    return { id: productId, success: true };
  }

  // ==========================================
  // BOOKING ENGINE (Phase 2)
  // ==========================================

  async getSlots(productId: string) {
    let slots: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'StoreAndCommerce',
        KeyConditionExpression: 'entityId = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: { ':p': `PRODUCT#${productId}`, ':s': 'SLOT#' },
      }));
      if (res.Items && res.Items.length > 0) {
        slots = res.Items.map(item => ({ id: (item.sk as string).replace(/^SLOT#/, ''), ...item }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getSlots] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('storeProducts').doc(productId).collection('slots').get();
        slots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getSlots] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }

    const now = new Date();
    const finalSlots: any[] = [];

    for (const slot of slots) {
      const lockExpiresAt = slot.lockExpiresAt
        ? (slot.lockExpiresAt.toDate ? slot.lockExpiresAt.toDate() : new Date(slot.lockExpiresAt))
        : null;

      if ((slot.status === 'locked' || slot.status === 'reserved') && lockExpiresAt && lockExpiresAt < now) {
        // Unlock in DynamoDB
        try {
          await docClient.send(new UpdateCommand({
            TableName: 'StoreAndCommerce',
            Key: { entityId: `PRODUCT#${productId}`, sk: `SLOT#${slot.id}` },
            UpdateExpression: 'SET #st = :av, lockedBy = :nul, lockExpiresAt = :nul',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: { ':av': 'available', ':nul': null },
          }));
        } catch (dynErr) {
          console.warn('[StoreService getSlots] DynamoDB unlock failed:', dynErr);
        }
        // Sync to Firestore
        try {
          await this.db.collection('storeProducts').doc(productId).collection('slots').doc(slot.id)
            .update({ status: 'available', lockedBy: null, lockExpiresAt: null });
        } catch (fsErr) {
          console.warn('[StoreService getSlots] Firestore unlock failed:', fsErr);
        }
        finalSlots.push({ ...slot, status: 'available', lockedBy: null, lockExpiresAt: null });
      } else {
        finalSlots.push(slot);
      }
    }

    return finalSlots;
  }

  async lockSlot(productId: string, slotId: string, userId: string) {
    let slotData: any = null;
    let fetchedFromDynamo = false;

    // 1. Fetch slot from DynamoDB
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${productId}`, sk: `SLOT#${slotId}` },
      }));
      if (res.Item) { slotData = res.Item; fetchedFromDynamo = true; }
    } catch (dynErr) {
      console.warn('[StoreService lockSlot] DynamoDB get failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      const doc = await this.db.collection('storeProducts').doc(productId).collection('slots').doc(slotId).get();
      if (!doc.exists) throw new NotFoundException('Slot not found');
      slotData = doc.data();
    }

    if (!slotData) throw new BadRequestException('Slot data is empty');

    const now = new Date();
    const lockExpiresAtVal = slotData.lockExpiresAt
      ? (slotData.lockExpiresAt.toDate ? slotData.lockExpiresAt.toDate() : new Date(slotData.lockExpiresAt))
      : null;

    if ((slotData.status === 'locked' || slotData.status === 'reserved') &&
        lockExpiresAtVal && lockExpiresAtVal > now && slotData.lockedBy !== userId) {
      throw new BadRequestException('Slot is already locked by another user');
    }
    if (slotData.status === 'booked') throw new BadRequestException('Slot is already booked');

    const lockDurationMs = 2 * 60 * 1000;
    const lockExpiresAt = new Date(now.getTime() + lockDurationMs);

    // 1. Write to DynamoDB
    try {
      await docClient.send(new UpdateCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${productId}`, sk: `SLOT#${slotId}` },
        UpdateExpression: 'SET #st = :res, lockedBy = :uid, lockExpiresAt = :exp',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':res': 'reserved', ':uid': userId, ':exp': lockExpiresAt.toISOString() },
      }));
    } catch (dynErr) {
      console.warn('[StoreService lockSlot] DynamoDB update failed:', dynErr);
    }

    // 2. Sync to Firestore
    try {
      await this.db.collection('storeProducts').doc(productId).collection('slots').doc(slotId)
        .update({ status: 'reserved', lockedBy: userId, lockExpiresAt });
    } catch (fsErr) {
      console.warn('[StoreService lockSlot] Firestore sync failed:', fsErr);
    }

    return { slotId, status: 'reserved', lockExpiresAt };
  }

  async unlockSlot(productId: string, slotId: string, userId: string) {
    let slotData: any = null;
    let fetchedFromDynamo = false;

    // 1. Fetch slot from DynamoDB
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${productId}`, sk: `SLOT#${slotId}` },
      }));
      if (res.Item) { slotData = res.Item; fetchedFromDynamo = true; }
    } catch (dynErr) {
      console.warn('[StoreService unlockSlot] DynamoDB get failed:', dynErr);
    }

    if (!fetchedFromDynamo) {
      const doc = await this.db.collection('storeProducts').doc(productId).collection('slots').doc(slotId).get();
      slotData = doc.exists ? doc.data() : null;
    }

    if (!slotData) return { success: true };

    if ((slotData.status === 'locked' || slotData.status === 'reserved') && slotData.lockedBy === userId) {
      // 1. Unlock in DynamoDB
      try {
        await docClient.send(new UpdateCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `SLOT#${slotId}` },
          UpdateExpression: 'SET #st = :av, lockedBy = :nul, lockExpiresAt = :nul',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':av': 'available', ':nul': null },
        }));
      } catch (dynErr) {
        console.warn('[StoreService unlockSlot] DynamoDB update failed:', dynErr);
      }
      // 2. Sync to Firestore
      try {
        await this.db.collection('storeProducts').doc(productId).collection('slots').doc(slotId)
          .update({ status: 'available', lockedBy: null, lockExpiresAt: null });
      } catch (fsErr) {
        console.warn('[StoreService unlockSlot] Firestore sync failed:', fsErr);
      }
    }

    return { success: true };
  }

  // ==========================================
  // AUCTION & BIDDING ENGINE (Phase 6)
  // ==========================================

  async getBids(productId: string) {
    let bids: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'StoreAndCommerce',
        KeyConditionExpression: 'entityId = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: { ':p': `PRODUCT#${productId}`, ':s': 'BID#' },
      }));
      if (res.Items && res.Items.length > 0) {
        bids = res.Items.map(item => ({ id: (item.sk as string).replace(/^BID#/, ''), ...item }));
        bids.sort((a, b) => (b.amountPaise ?? 0) - (a.amountPaise ?? 0));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getBids] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('storeProducts').doc(productId).collection('bids')
          .orderBy('amountPaise', 'desc').get();
        bids = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getBids] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }

    return bids;
  }

  async placeBid(productId: string, amountPaise: number, userId: string) {
    // 1. Fetch product from DynamoDB
    let product: any = null;
    let fetchedFromDynamo = false;
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
      }));
      if (res.Item) { product = res.Item; fetchedFromDynamo = true; }
    } catch (dynErr) {
      console.warn('[StoreService placeBid] DynamoDB get failed:', dynErr);
    }

    if (!fetchedFromDynamo) {
      const doc = await this.db.collection('storeProducts').doc(productId).get();
      if (!doc.exists) throw new NotFoundException('Auction not found');
      product = doc.data();
    }
    if (!product) throw new BadRequestException('Auction product data is empty');

    const currentBidPaise = product.pricePaise || product.currentBidPaise || 0;
    if (amountPaise <= currentBidPaise) {
      throw new BadRequestException(`Bid must be greater than current bid: ${currentBidPaise}`);
    }

    const now = new Date();
    let endsAt = product.endsAt
      ? (product.endsAt.toDate ? product.endsAt.toDate() : new Date(product.endsAt))
      : new Date(now.getTime() + 86400 * 1000);

    if (endsAt.getTime() < now.getTime()) throw new BadRequestException('Auction has already ended');

    const timeRemainingMs = endsAt.getTime() - now.getTime();
    const fiveMinutesMs = 5 * 60 * 1000;
    let extended = false;

    if (timeRemainingMs < fiveMinutesMs) { endsAt = new Date(now.getTime() + fiveMinutesMs); extended = true; }

    const bidId = randomUUID();

    // 2. Write bid to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: 'StoreAndCommerce',
        Item: { entityId: `PRODUCT#${productId}`, sk: `BID#${bidId}`, userId, amountPaise, createdAt: Date.now() },
      }));
      await docClient.send(new UpdateCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
        UpdateExpression: 'SET pricePaise = :amt, currentBidPaise = :amt, biddersCount = if_not_exists(biddersCount, :z) + :one, endsAt = :ends',
        ExpressionAttributeValues: { ':amt': amountPaise, ':one': 1, ':z': 0, ':ends': endsAt.toISOString() },
      }));
    } catch (dynErr) {
      console.warn('[StoreService placeBid] DynamoDB writes failed:', dynErr);
    }

    // 3. Sync to Firestore
    try {
      const productRef = this.db.collection('storeProducts').doc(productId);
      await productRef.collection('bids').doc(bidId).set({ userId, amountPaise, createdAt: FieldValue.serverTimestamp() });
      await productRef.update({ pricePaise: amountPaise, currentBidPaise: amountPaise, biddersCount: FieldValue.increment(1), endsAt });
    } catch (fsErr) {
      console.warn('[StoreService placeBid] Firestore sync failed:', fsErr);
    }

    return { success: true, currentBidPaise: amountPaise, endsAt, extended };
  }

  // ==========================================
  // ORDERS, PAYMENTS & WALLET (Phase 3)
  // ==========================================

  async getWalletBalance(userId: string): Promise<number> {
    let balance = 0;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'GamificationAndWallet',
        KeyConditionExpression: 'userId = :u AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':u': `USER#${userId}`, ':p': 'WALLET_TX#' },
      }));
      if (res.Items) {
        res.Items.forEach(tx => {
          if (tx.type === 'credit') balance += tx.amountPaise || 0;
          else if (tx.type === 'debit') balance -= tx.amountPaise || 0;
        });
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getWalletBalance] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('wallet_transactions').where('userId', '==', userId).get();
        snapshot.docs.forEach(doc => {
          const tx = doc.data();
          if (tx.type === 'credit') balance += tx.amountPaise || 0;
          else if (tx.type === 'debit') balance -= tx.amountPaise || 0;
        });
      } catch (fsErr) {
        console.error('[StoreService getWalletBalance] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }

    return balance;
  }

  async getWalletTransactions(userId: string) {
    let txList: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'GamificationAndWallet',
        KeyConditionExpression: 'userId = :u AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':u': `USER#${userId}`, ':p': 'WALLET_TX#' },
      }));
      if (res.Items) {
        txList = res.Items.map(item => ({ id: (item.sk as string).replace(/^WALLET_TX#/, ''), ...item }));
        txList.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getWalletTransactions] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('wallet_transactions').where('userId', '==', userId)
          .orderBy('createdAt', 'desc').get();
        txList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getWalletTransactions] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }

    return txList;
  }

  async getCoinsBalance(userId: string): Promise<number> {
    let balance = 0;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'GamificationAndWallet',
        KeyConditionExpression: 'userId = :u AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':u': `USER#${userId}`, ':p': 'COIN_TX#' },
      }));
      if (res.Items) {
        res.Items.forEach(tx => {
          if (tx.type === 'credit') balance += tx.amount || 0;
          else if (tx.type === 'debit') balance -= tx.amount || 0;
        });
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getCoinsBalance] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('reward_coins_ledger').where('userId', '==', userId).get();
        snapshot.docs.forEach(doc => {
          const tx = doc.data();
          if (tx.type === 'credit') balance += tx.amount || 0;
          else if (tx.type === 'debit') balance -= tx.amount || 0;
        });
      } catch (fsErr) {
        console.error('[StoreService getCoinsBalance] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }

    return balance;
  }

  async getCoinsTransactions(userId: string) {
    let txList: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'GamificationAndWallet',
        KeyConditionExpression: 'userId = :u AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':u': `USER#${userId}`, ':p': 'COIN_TX#' },
      }));
      if (res.Items) {
        txList = res.Items.map(item => ({ id: (item.sk as string).replace(/^COIN_TX#/, ''), ...item }));
        txList.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getCoinsTransactions] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('reward_coins_ledger').where('userId', '==', userId).get();
        txList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getCoinsTransactions] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }

    return txList;
  }

  async checkout(checkoutDto: {
    productId: string;
    slotId?: string;
    variantId?: string;
    userId: string;
    paymentMethod: 'upi' | 'gpay' | 'phonepe' | 'paytm' | 'card' | 'wallet';
    pricePaise: number;
    idempotencyKey: string;
  }) {
    const { productId, slotId, variantId, userId, paymentMethod, pricePaise, idempotencyKey } = checkoutDto;
    const now = Date.now();
    const orderId = randomUUID();

    // 1. Idempotency check — DynamoDB first
    try {
      const idem = await docClient.send(new GetCommand({
        TableName: 'IdentityAndAccess',
        Key: { entityId: `IDEMPOTENCY#${idempotencyKey}`, sk: `IDEMPOTENCY#${idempotencyKey}` },
      }));
      if (idem.Item) return idem.Item.response;
    } catch (dynErr) {
      console.warn('[Checkout] DynamoDB idempotency check failed:', dynErr);
    }
    // Idempotency fallback — Firestore
    try {
      const idempotencyDoc = await this.db.collection('idempotencyKeys').doc(idempotencyKey).get();
      if (idempotencyDoc.exists) return idempotencyDoc.data()?.response;
    } catch (fsErr) {
      console.warn('[Checkout] Firestore idempotency check failed:', fsErr);
    }

    // 2. Fetch product — DynamoDB first
    let product: any = null;
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
      }));
      if (res.Item) product = res.Item;
    } catch (dynErr) {
      console.warn('[Checkout] DynamoDB product fetch failed:', dynErr);
    }
    if (!product) {
      const doc = await this.db.collection('storeProducts').doc(productId).get();
      if (!doc.exists) throw new NotFoundException('Product not found');
      product = doc.data();
    }
    if (!product) throw new BadRequestException('Product data is empty');

    let eventDate: string | null = null;

    // 3. Slot handling
    if (slotId) {
      let slot: any = null;
      try {
        const res = await docClient.send(new GetCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `SLOT#${slotId}` },
        }));
        if (res.Item) slot = res.Item;
      } catch (dynErr) { console.warn('[Checkout] DynamoDB slot fetch failed:', dynErr); }
      if (!slot) {
        const slotDoc = await this.db.collection('storeProducts').doc(productId).collection('slots').doc(slotId).get();
        if (!slotDoc.exists) throw new NotFoundException('Slot not found');
        slot = slotDoc.data();
      }
      if (!slot) throw new BadRequestException('Slot data is empty');
      if (slot.status === 'booked') throw new BadRequestException('Slot is already booked');
      if (slot.date && slot.time) {
        try {
          const [time, modifier] = slot.time.split(' ');
          let [hours, minutes] = time.split(':').map(Number);
          if (modifier === 'PM' && hours < 12) hours += 12;
          if (modifier === 'AM' && hours === 12) hours = 0;
          eventDate = `${slot.date}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00Z`;
        } catch (e) { eventDate = `${slot.date}T00:00:00Z`; }
      }
      const nowDate = new Date();
      if ((slot.status === 'locked' || slot.status === 'reserved') && slot.lockExpiresAt) {
        const expiresAt = slot.lockExpiresAt.toDate ? slot.lockExpiresAt.toDate() : new Date(slot.lockExpiresAt);
        if (expiresAt < nowDate) throw new BadRequestException('Slot lock has expired');
        if (slot.lockedBy !== userId) throw new BadRequestException('Slot is locked by another user');
      }
      // Update slot in DynamoDB
      try {
        await docClient.send(new UpdateCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `SLOT#${slotId}` },
          UpdateExpression: 'SET #st = :b, bookedBy = :uid, orderId = :oid',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':b': 'booked', ':uid': userId, ':oid': orderId },
        }));
      } catch (dynErr) { console.warn('[Checkout] DynamoDB slot booking failed:', dynErr); }
    }

    // 4. Product-type specific mutations in DynamoDB
    const pCatLower = (product.category || '').toLowerCase();

    if ((pCatLower === 'experience' || pCatLower === 'experiences') && !slotId) {
      const seatsBooked = product.seatsBooked || 0;
      const totalSeats = product.totalSeats || 0;
      if (seatsBooked >= totalSeats) throw new BadRequestException('No seats left');
      try {
        await docClient.send(new UpdateCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
          UpdateExpression: 'SET seatsBooked = if_not_exists(seatsBooked, :z) + :one',
          ExpressionAttributeValues: { ':z': 0, ':one': 1 },
        }));
      } catch (dynErr) { console.warn('[Checkout] DynamoDB experience seats update failed:', dynErr); }
    }

    if (pCatLower === 'memorabilia') {
      try {
        await docClient.send(new UpdateCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
          UpdateExpression: 'SET #st = :s, lockedBy = :nul, lockExpiresAt = :nul',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':s': 'sold', ':nul': null },
        }));
      } catch (dynErr) { console.warn('[Checkout] DynamoDB memorabilia sold update failed:', dynErr); }
    }

    let updatedVariants: any[] | null = null;
    let newTotalStock = 0;
    let isProductAvailable = false;
    if (pCatLower === 'brands') {
      if (!variantId) throw new BadRequestException('Size selection is required');
      const variants = product.variants || [];
      const variantIndex = variants.findIndex((v: any) => v.id === variantId);
      if (variantIndex === -1) throw new BadRequestException(`Selected variant "${variantId}" not found`);
      const variant = variants[variantIndex];
      if (variant.stock <= 0 || !variant.available) throw new BadRequestException(`Variant "${variant.size}" is out of stock`);
      variant.stock -= 1;
      if (variant.stock === 0) variant.available = false;
      newTotalStock = (product.totalStock || 0) - 1;
      isProductAvailable = newTotalStock > 0;
      updatedVariants = variants;
      try {
        await docClient.send(new UpdateCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
          UpdateExpression: 'SET variants = :v, totalStock = :t, isAvailable = :ia, updatedAt = :now',
          ExpressionAttributeValues: { ':v': variants, ':t': newTotalStock, ':ia': isProductAvailable, ':now': now },
        }));
      } catch (dynErr) { console.warn('[Checkout] DynamoDB brands variant stock update failed:', dynErr); }
    }

    if (pCatLower === 'auctions' || product.category === 'Auctions') {
      if (product.status !== 'closed' || product.winnerId !== userId || product.winnerPaymentStatus !== 'pending') {
        throw new BadRequestException('Auction is not closed, you are not the winner, or payment has already been completed/expired.');
      }
      try {
        await docClient.send(new UpdateCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
          UpdateExpression: 'SET winnerPaymentStatus = :paid, updatedAt = :now',
          ExpressionAttributeValues: { ':paid': 'paid', ':now': now },
        }));
      } catch (dynErr) { console.warn('[Checkout] DynamoDB auction payment update failed:', dynErr); }
    }

    if (!eventDate && product.date) eventDate = product.date;
    if (!eventDate && product.eventStartsAt) eventDate = product.eventStartsAt;

    // 5. Wallet deduction
    if (paymentMethod === 'wallet') {
      const currentBalance = await this.getWalletBalance(userId);
      if (currentBalance < pricePaise) throw new BadRequestException('Insufficient wallet balance');
    }
    const walletTxId = randomUUID();
    try {
      await docClient.send(new PutCommand({
        TableName: 'GamificationAndWallet',
        Item: {
          userId: `USER#${userId}`,
          sk: `WALLET_TX#${walletTxId}`,
          amountPaise: pricePaise,
          type: 'debit',
          description: paymentMethod === 'wallet'
            ? `Purchase: ${product.title || product.name}`
            : `Purchase (${paymentMethod.toUpperCase()}): ${product.title || product.name}`,
          createdAt: now,
        },
      }));
    } catch (dynErr) { console.warn('[Checkout] DynamoDB wallet tx failed:', dynErr); }

    // 6. Build order data
    const qrToken = randomUUID();
    const isOnlineEvent = (product.category === 'events' && product.type === 'virtual') ||
                          ((pCatLower === 'experience' || pCatLower === 'experiences') && product.type === 'online');
    const joinToken = isOnlineEvent ? randomUUID() : null;

    let selectedListing: any = null;
    if (pCatLower === 'athletes') {
      const targetListingId = variantId || slotId;
      const listings = product.listings || [];
      selectedListing = listings.find((item: any) => String(item.id) === String(targetListingId)) || listings[0] || null;
    }

    let initialStatus = (pCatLower === 'digital' || pCatLower === 'memberships') ? 'completed' : 'upcoming';
    if (pCatLower === 'athletes') {
      const fType = selectedListing?.fulfillmentType || 'library';
      initialStatus = (fType === 'library') ? 'completed' : 'upcoming';
    }

    const orderData: any = {
      orderId,
      userId,
      productId,
      productType: product.category || 'general',
      category: product.category || 'memberships',
      slotId: slotId || null,
      title: selectedListing ? selectedListing.title : (product.title || product.name),
      pricePaise,
      paymentMethod,
      status: initialStatus,
      eventDate,
      createdAt: now,
      updatedAt: now,
    };

    if (pCatLower === 'athletes' && selectedListing) {
      orderData.athleteId = productId;
      orderData.athleteName = product.name || product.title || '';
      orderData.listingId = selectedListing.id;
      orderData.listingTitle = selectedListing.title;
      orderData.listingType = selectedListing.type || 'Athlete Listing';
      orderData.fulfillmentType = selectedListing.fulfillmentType || 'library';
      if (selectedListing.fulfillmentType === 'physical') orderData.deliveryStatus = 'processing';
    }
    if (product.category === 'events') {
      orderData.qrToken = qrToken;
      orderData.eventMode = product.type === 'virtual' ? 'online' : 'offline';
      orderData.checkedIn = false;
      orderData.checkedInAt = null;
      if (joinToken) orderData.joinToken = joinToken;
    }
    if (pCatLower === 'experience' || pCatLower === 'experiences') {
      orderData.eventPassToken = randomUUID();
      if (product.type === 'online') {
        orderData.qrToken = qrToken;
        orderData.eventMode = 'online';
        orderData.checkedIn = false;
        orderData.checkedInAt = null;
        if (joinToken) orderData.joinToken = joinToken;
      }
    }

    // 7. Put order to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: 'StoreAndCommerce',
        Item: { entityId: `ORDER#${orderId}`, sk: `ORDER#${orderId}`, ...orderData },
      }));

      // Revenue splits
      const platformFee = Math.round(pricePaise * 0.15);
      const afiRoyalty = product.governance_state === 'approved' ? Math.round(pricePaise * 0.10) : 0;
      const athleteShare = pricePaise - platformFee - afiRoyalty;
      await docClient.send(new PutCommand({
        TableName: 'StoreAndCommerce',
        Item: {
          entityId: `ORDER#${orderId}`,
          sk: `SPLIT#${randomUUID()}`,
          orderId, pricePaise, platformFee, afiRoyalty, athleteShare,
          athleteId: product.athleteId || product.coachId || null,
          createdAt: now,
        },
      }));

      // Reward coins
      const rewardAmount = product.rewardCoins || 0;
      if (rewardAmount > 0) {
        const rewardId = randomUUID();
        await docClient.send(new PutCommand({
          TableName: 'GamificationAndWallet',
          Item: { userId: `USER#${userId}`, sk: `COIN_TX#${rewardId}`, amount: rewardAmount, type: 'credit', description: `Purchase Reward: ${product.title || product.name}`, createdAt: now },
        }));
        const notifId = randomUUID();
        await docClient.send(new PutCommand({
          TableName: 'SocialAndContent',
          Item: { contentId: `USER#${userId}`, sk: `NOTIF#${notifId}`, id: notifId, title: 'Rewards Gained!', message: `You earned ${rewardAmount} Reward Coins from purchasing "${product.title || product.name}"!`, type: 'reward', isRead: false, createdAt: now },
        }));
      }

      // Digital library
      if (pCatLower === 'digital') {
        await docClient.send(new PutCommand({
          TableName: 'SocialAndContent',
          Item: { contentId: `USER#${userId}`, sk: `LIBRARY#${productId}`, productId, title: product.title || product.name, image: product.image || '', type: product.type || 'Training Program', progress: 0, purchasedAt: now },
        }));
      }

      // Memberships
      if (pCatLower === 'memberships') {
        const durationDays = product.durationDays || 30;
        const renewalDate = new Date(now + durationDays * 86400 * 1000).toISOString();
        await docClient.send(new PutCommand({
          TableName: 'IdentityAndAccess',
          Item: { entityId: `USER#${userId}`, sk: 'MEMBERSHIP', currentPlanId: productId, currentPlanName: product.name || product.title || 'Membership Plan', status: 'active', startDate: new Date(now).toISOString(), renewalDate, pausedAt: null, cancelledAt: null, autoRenew: true, lastOrderId: orderId, updatedAt: now },
        }));
      }

      // Athletes
      if (pCatLower === 'athletes' && selectedListing) {
        const fulfillmentType = orderData.fulfillmentType || 'library';
        const athleteId = productId;
        const listingId = orderData.listingId || productId;
        if (fulfillmentType === 'library') {
          await docClient.send(new PutCommand({
            TableName: 'SocialAndContent',
            Item: { contentId: `USER#${userId}`, sk: `LIBRARY#${athleteId}_${listingId}`, productId: `${athleteId}_${listingId}`, title: orderData.listingTitle, image: product.image || '', type: orderData.listingType, athleteId, listingId, progress: 0, purchasedAt: now },
          }));
        } else if (fulfillmentType === 'booking') {
          const bookingId = randomUUID();
          await docClient.send(new PutCommand({
            TableName: 'SportsData',
            Item: { entityId: `USER#${userId}`, sk: `ATHLETE_BOOKING#${bookingId}`, bookingId, userId, athleteId, athleteName: orderData.athleteName || '', listingId, listingTitle: orderData.listingTitle, listingType: orderData.listingType, orderId, status: 'pending_scheduling', requestedAt: now, scheduledAt: null, meetingLink: null },
          }));
        }
      }

      // Idempotency key
      const response = { orderId, success: true };
      await docClient.send(new PutCommand({
        TableName: 'IdentityAndAccess',
        Item: { entityId: `IDEMPOTENCY#${idempotencyKey}`, sk: `IDEMPOTENCY#${idempotencyKey}`, response, createdAt: now },
      }));
    } catch (dynErr) {
      console.warn('[Checkout] DynamoDB checkout ops failed:', dynErr);
    }

    // 8. Firestore dual-write
    try {
      await this.db.runTransaction(async (transaction) => {
        const productRef = this.db.collection('storeProducts').doc(productId);
        if (slotId) {
          transaction.update(productRef.collection('slots').doc(slotId), { status: 'booked', bookedBy: userId, orderId });
        }
        if ((pCatLower === 'experience' || pCatLower === 'experiences') && !slotId) {
          transaction.update(productRef, { seatsBooked: FieldValue.increment(1) });
        }
        if (pCatLower === 'memorabilia') {
          transaction.update(productRef, { status: 'sold', lockedBy: null, lockExpiresAt: null });
        }
        if (pCatLower === 'brands' && updatedVariants !== null) {
          transaction.update(productRef, { variants: updatedVariants, totalStock: newTotalStock, isAvailable: isProductAvailable, updatedAt: FieldValue.serverTimestamp() });
        }
        if (pCatLower === 'auctions' || product.category === 'Auctions') {
          transaction.update(productRef, { winnerPaymentStatus: 'paid', updatedAt: FieldValue.serverTimestamp() });
        }
        // Wallet tx
        transaction.set(this.db.collection('wallet_transactions').doc(walletTxId), {
          userId, amountPaise: pricePaise, type: 'debit',
          description: paymentMethod === 'wallet' ? `Purchase: ${product.title || product.name}` : `Purchase (${paymentMethod.toUpperCase()}): ${product.title || product.name}`,
          createdAt: FieldValue.serverTimestamp(),
        });
        // Orders
        const fsOrderData = { ...orderData, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
        transaction.set(this.db.collection('storeOrders').doc(orderId), fsOrderData);
        transaction.set(this.db.collection('users').doc(userId).collection('orders').doc(orderId), fsOrderData);
        // Revenue splits
        const platformFee = Math.round(pricePaise * 0.15);
        const afiRoyalty = product.governance_state === 'approved' ? Math.round(pricePaise * 0.10) : 0;
        const athleteShare = pricePaise - platformFee - afiRoyalty;
        transaction.set(this.db.collection('revenue_splits').doc(randomUUID()), { orderId, pricePaise, platformFee, afiRoyalty, athleteShare, athleteId: product.athleteId || product.coachId || null, createdAt: FieldValue.serverTimestamp() });
        // Reward coins
        const rewardAmount = product.rewardCoins || 0;
        if (rewardAmount > 0) {
          transaction.set(this.db.collection('reward_coins_ledger').doc(randomUUID()), { userId, amount: rewardAmount, type: 'credit', description: `Purchase Reward: ${product.title || product.name}`, createdAt: FieldValue.serverTimestamp() });
          transaction.set(this.db.collection('users').doc(userId).collection('notifications').doc(randomUUID()), { id: randomUUID(), title: 'Rewards Gained!', message: `You earned ${rewardAmount} Reward Coins from purchasing "${product.title || product.name}"!`, type: 'reward', read: false, createdAt: FieldValue.serverTimestamp() });
        }
        if (pCatLower === 'digital') {
          transaction.set(this.db.collection('users').doc(userId).collection('library').doc(productId), { productId, title: product.title || product.name, image: product.image || '', type: product.type || 'Training Program', progress: 0, purchasedAt: FieldValue.serverTimestamp() });
        }
        if (pCatLower === 'memberships') {
          const durationDays = product.durationDays || 30;
          const renewalDate = new Date(now + durationDays * 86400 * 1000).toISOString();
          transaction.set(this.db.collection('userMemberships').doc(userId), { currentPlanId: productId, currentPlanName: product.name || product.title || 'Membership Plan', status: 'active', startDate: new Date(now).toISOString(), renewalDate, pausedAt: null, cancelledAt: null, autoRenew: true, lastOrderId: orderId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        if (pCatLower === 'athletes' && selectedListing) {
          const fulfillmentType = orderData.fulfillmentType || 'library';
          const athleteId = productId;
          const listingId = orderData.listingId || productId;
          if (fulfillmentType === 'library') {
            transaction.set(this.db.collection('users').doc(userId).collection('library').doc(`${athleteId}_${listingId}`), { productId: `${athleteId}_${listingId}`, title: orderData.listingTitle, image: product.image || '', type: orderData.listingType, athleteId, listingId, progress: 0, purchasedAt: FieldValue.serverTimestamp() });
          } else if (fulfillmentType === 'booking') {
            const bookingId = randomUUID();
            transaction.set(this.db.collection('athleteBookings').doc(userId).collection('items').doc(bookingId), { bookingId, userId, athleteId, athleteName: orderData.athleteName || '', listingId, listingTitle: orderData.listingTitle, listingType: orderData.listingType, orderId, status: 'pending_scheduling', requestedAt: FieldValue.serverTimestamp(), scheduledAt: null, meetingLink: null });
          }
        }
        transaction.set(this.db.collection('idempotencyKeys').doc(idempotencyKey), { response: { orderId, success: true }, createdAt: FieldValue.serverTimestamp() });
      });
    } catch (fsErr) {
      console.warn('[Checkout] Firestore dual-write failed:', fsErr);
    }

    return { orderId, success: true };
  }

  async getUserOrders(userId: string, category?: string) {
    let orders: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB GSI first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'StoreAndCommerce',
        IndexName: 'userId-createdAt-index',
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
      }));
      if (res.Items) {
        orders = res.Items;
        if (category) orders = orders.filter(o => o.productType === category || o.category === category);
        orders.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getUserOrders] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        let query: any = this.db.collection('storeOrders').where('userId', '==', userId);
        if (category) query = query.where('productType', '==', category);
        const snapshot = await query.get();
        orders = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getUserOrders] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }

    return orders;
  }

  async getExperienceOrderById(orderId: string, userId: string) {
    let orderData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `ORDER#${orderId}`, sk: `ORDER#${orderId}` },
      }));
      if (res.Item) { orderData = { id: orderId, ...res.Item }; fetchedFromDynamo = true; }
    } catch (dynErr) {
      console.warn('[StoreService getExperienceOrderById] DynamoDB get failed:', dynErr);
    }

    if (!fetchedFromDynamo) {
      const doc = await this.db.collection('storeOrders').doc(orderId).get();
      if (!doc.exists) throw new NotFoundException(`Order with ID ${orderId} not found`);
      orderData = { id: doc.id, ...doc.data() };
    }
    if (!orderData) throw new BadRequestException('Order data is empty');
    if (orderData.userId !== userId) throw new BadRequestException('Order does not belong to user');
    if (orderData.productType !== 'experience' && orderData.productType !== 'experiences') throw new BadRequestException('Not an experience order');

    let productData: any = {};
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${orderData.productId}`, sk: `PRODUCT#${orderData.productId}` },
      }));
      if (res.Item) productData = res.Item;
    } catch (dynErr) {
      const doc = await this.db.collection('storeProducts').doc(orderData.productId).get();
      if (doc.exists) productData = doc.data() || {};
    }

    return { ...orderData, productDetails: productData };
  }

  async getEventPass(orderId: string, userId: string) {
    let orderData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `ORDER#${orderId}`, sk: `ORDER#${orderId}` },
      }));
      if (res.Item) { orderData = res.Item; fetchedFromDynamo = true; }
    } catch (dynErr) {
      console.warn('[StoreService getEventPass] DynamoDB get failed:', dynErr);
    }
    if (!fetchedFromDynamo) {
      const doc = await this.db.collection('storeOrders').doc(orderId).get();
      if (!doc.exists) throw new NotFoundException(`Order with ID ${orderId} not found`);
      orderData = doc.data();
    }
    if (!orderData) throw new BadRequestException('Order data is empty');
    if (orderData.userId !== userId) throw new BadRequestException('Order does not belong to user');
    if (orderData.status === 'cancelled') throw new BadRequestException('Order is cancelled');

    let productData: any = {};
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${orderData.productId}`, sk: `PRODUCT#${orderData.productId}` },
      }));
      if (res.Item) productData = res.Item;
    } catch (dynErr) {
      const doc = await this.db.collection('storeProducts').doc(orderData.productId).get();
      if (doc.exists) productData = doc.data() || {};
    }

    let userData: any = null;
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'IdentityAndAccess',
        Key: { entityId: `USER#${userId}`, sk: 'USER#META' },
      }));
      if (res.Item) userData = res.Item;
    } catch (dynErr) {
      const doc = await this.db.collection('users').doc(userId).get();
      if (doc.exists) userData = doc.data();
    }

    const participantName = userData ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim() : 'Guest';
    return {
      eventPassToken: orderData.eventPassToken || null,
      title: orderData.title || productData.title || '',
      athlete: productData.athlete || '',
      venue: productData.venue || null,
      onlineLink: productData.onlineLink || null,
      date: orderData.eventDate || productData.eventStartsAt || null,
      bookingId: orderData.orderId || orderId,
      participantName: participantName || 'Guest User',
      joinToken: orderData.joinToken || null,
    };
  }

  async createSessionRequest(payload: any) {
    const requestId = randomUUID();
    const now = Date.now();

    // 1. Write to DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: 'StoreAndCommerce',
        Item: { entityId: `SESSION_REQ#${requestId}`, sk: `SESSION_REQ#${requestId}`, ...payload, status: 'open', createdAt: now },
      }));
    } catch (dynErr) {
      console.warn('[StoreService createSessionRequest] DynamoDB put failed:', dynErr);
    }
    // 2. Sync to Firestore
    try {
      await this.db.collection('session_requests').doc(requestId).set({ ...payload, status: 'open', createdAt: FieldValue.serverTimestamp() });
    } catch (fsErr) {
      console.warn('[StoreService createSessionRequest] Firestore sync failed:', fsErr);
    }
    return { id: requestId, success: true };
  }

  async getSessionRequests(userId: string) {
    let requests: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB scan
    try {
      const res = await docClient.send(new ScanCommand({
        TableName: 'StoreAndCommerce',
        FilterExpression: 'userId = :u AND begins_with(entityId, :p)',
        ExpressionAttributeValues: { ':u': userId, ':p': 'SESSION_REQ#' },
      }));
      if (res.Items && res.Items.length > 0) {
        requests = res.Items.map(item => ({ id: (item.entityId as string).replace(/^SESSION_REQ#/, ''), ...item }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getSessionRequests] DynamoDB scan failed:', dynErr);
    }
    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('session_requests').where('userId', '==', userId).get();
        requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getSessionRequests] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }
    return requests;
  }

  async getWishlist(userId: string) {
    let wishlist: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'SocialAndContent',
        KeyConditionExpression: 'contentId = :u AND begins_with(sk, :w)',
        ExpressionAttributeValues: { ':u': `USER#${userId}`, ':w': 'WISHLIST#' },
      }));
      if (res.Items) {
        wishlist = res.Items.map(item => ({ id: (item.sk as string).replace(/^WISHLIST#/, ''), ...item }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getWishlist] DynamoDB query failed:', dynErr);
    }
    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('users').doc(userId).collection('wishlist').get();
        wishlist = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getWishlist] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }
    return wishlist;
  }

  async toggleWishlist(userId: string, productId: string, action: 'add' | 'remove') {
    // 1. Write to DynamoDB
    try {
      if (action === 'remove') {
        await docClient.send(new DeleteCommand({
          TableName: 'SocialAndContent',
          Key: { contentId: `USER#${userId}`, sk: `WISHLIST#${productId}` },
        }));
      } else {
        let productData: any = {};
        try {
          const res = await docClient.send(new GetCommand({ TableName: 'StoreAndCommerce', Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` } }));
          if (res.Item) productData = res.Item;
        } catch (e) {}
        await docClient.send(new PutCommand({
          TableName: 'SocialAndContent',
          Item: { contentId: `USER#${userId}`, sk: `WISHLIST#${productId}`, productId, title: productData?.title || productData?.name || 'Product', pricePaise: productData?.pricePaise || 0, image: productData?.image || '', category: productData?.category || 'general', addedAt: Date.now() },
        }));
      }
    } catch (dynErr) {
      console.warn('[StoreService toggleWishlist] DynamoDB write failed:', dynErr);
    }
    // 2. Sync to Firestore
    try {
      const docRef = this.db.collection('users').doc(userId).collection('wishlist').doc(productId);
      if (action === 'remove') {
        await docRef.delete();
      } else {
        const productDoc = await this.db.collection('storeProducts').doc(productId).get();
        const productData = productDoc.exists ? productDoc.data() : {};
        await docRef.set({ productId, title: productData?.title || productData?.name || 'Product', pricePaise: productData?.pricePaise || 0, image: productData?.image || '', category: productData?.category || 'general', addedAt: FieldValue.serverTimestamp() });
      }
    } catch (fsErr) {
      console.warn('[StoreService toggleWishlist] Firestore sync failed:', fsErr);
    }
    return { success: true };
  }

  async getUserLibrary(userId: string) {
    let library: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'SocialAndContent',
        KeyConditionExpression: 'contentId = :u AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':u': `USER#${userId}`, ':p': 'LIBRARY#' },
      }));
      if (res.Items) {
        library = res.Items.map(item => ({ id: (item.sk as string).replace(/^LIBRARY#/, ''), ...item }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getUserLibrary] DynamoDB query failed:', dynErr);
    }
    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('users').doc(userId).collection('library').get();
        library = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getUserLibrary] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }
    return library;
  }

  async getRecentlyViewed(userId: string) {
    let items: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: 'SocialAndContent',
        KeyConditionExpression: 'contentId = :u AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':u': `USER#${userId}`, ':p': 'RECENTLY_VIEWED#' },
      }));
      if (res.Items) {
        items = res.Items.map(item => ({ id: (item.sk as string).replace(/^RECENTLY_VIEWED#/, ''), ...item }));
        items.sort((a, b) => (b.viewedAt ?? 0) - (a.viewedAt ?? 0));
        items = items.slice(0, 10);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getRecentlyViewed] DynamoDB query failed:', dynErr);
    }
    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('users').doc(userId).collection('recentlyViewed').orderBy('viewedAt', 'desc').limit(10).get();
        items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error('[StoreService getRecentlyViewed] Firestore fallback failed:', fsErr);
        throw fsErr;
      }
    }
    return items;
  }

  async addRecentlyViewed(userId: string, productId: string) {
    const now = Date.now();

    let productData: any = {};
    try {
      const res = await docClient.send(new GetCommand({ TableName: 'StoreAndCommerce', Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` } }));
      if (res.Item) productData = res.Item;
    } catch (e) {}

    // 1. Write to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: 'SocialAndContent',
        Item: { contentId: `USER#${userId}`, sk: `RECENTLY_VIEWED#${productId}`, productId, title: productData?.title || productData?.name || 'Product', pricePaise: productData?.pricePaise || 0, image: productData?.image || '', category: productData?.category || 'general', viewedAt: now },
      }));
    } catch (dynErr) {
      console.warn('[StoreService addRecentlyViewed] DynamoDB write failed:', dynErr);
    }
    // 2. Sync to Firestore
    try {
      const productDoc = await this.db.collection('storeProducts').doc(productId).get();
      const fsProductData = productDoc.exists ? productDoc.data() : {};
      await this.db.collection('users').doc(userId).collection('recentlyViewed').doc(productId).set({
        productId, title: fsProductData?.title || fsProductData?.name || 'Product', pricePaise: fsProductData?.pricePaise || 0, image: fsProductData?.image || '', category: fsProductData?.category || 'general', viewedAt: FieldValue.serverTimestamp(),
      });
    } catch (fsErr) {
      console.warn('[StoreService addRecentlyViewed] Firestore sync failed:', fsErr);
    }
    return { success: true };
  }

  async getUserMembership(userId: string) {
    let membershipData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'IdentityAndAccess',
        Key: { entityId: `USER#${userId}`, sk: 'MEMBERSHIP' },
      }));
      if (res.Item) { membershipData = res.Item; fetchedFromDynamo = true; }
    } catch (dynErr) {
      console.warn('[StoreService getUserMembership] DynamoDB get failed:', dynErr);
    }
    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      const doc = await this.db.collection('userMemberships').doc(userId).get();
      if (!doc.exists) return { hasMembership: false, membership: null, plan: null };
      membershipData = doc.data();
    }
    if (!membershipData) return { hasMembership: false, membership: null, plan: null };

    let planData = null;
    if (membershipData.currentPlanId) {
      try {
        const res = await docClient.send(new GetCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${membershipData.currentPlanId}`, sk: `PRODUCT#${membershipData.currentPlanId}` },
        }));
        if (res.Item) planData = { id: membershipData.currentPlanId, ...res.Item };
      } catch (dynErr) {
        const doc = await this.db.collection('storeProducts').doc(membershipData.currentPlanId).get();
        if (doc.exists) planData = { id: doc.id, ...doc.data() };
      }
    }
    return { hasMembership: true, membership: { id: userId, ...membershipData }, plan: planData };
  }

  async updateUserMembership(userId: string, planId: string) {
    let planData: any = null;
    let fetchedFromDynamo = false;

    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `PRODUCT#${planId}`, sk: `PRODUCT#${planId}` },
      }));
      if (res.Item) { planData = res.Item; fetchedFromDynamo = true; }
    } catch (dynErr) {
      console.warn('[StoreService updateUserMembership] DynamoDB get plan failed:', dynErr);
    }
    if (!fetchedFromDynamo) {
      const doc = await this.db.collection('storeProducts').doc(planId).get();
      if (!doc.exists) throw new Error('Plan not found');
      planData = doc.data();
    }

    const durationDays = planData?.durationDays || 30;
    const now = Date.now();
    const renewalDate = new Date(now + durationDays * 86400 * 1000).toISOString();

    const membershipData = {
      currentPlanId: planId,
      currentPlanName: planData?.name || planData?.title || 'Membership Plan',
      status: 'active',
      startDate: new Date(now).toISOString(),
      renewalDate,
      autoRenew: true,
      updatedAt: now,
    };

    // 1. Write to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: 'IdentityAndAccess',
        Item: { entityId: `USER#${userId}`, sk: 'MEMBERSHIP', ...membershipData },
      }));
    } catch (dynErr) {
      console.warn('[StoreService updateUserMembership] DynamoDB put failed:', dynErr);
    }
    // 2. Sync to Firestore
    try {
      await this.db.collection('userMemberships').doc(userId).set({ ...membershipData, updatedAt: new Date(now) }, { merge: true });
    } catch (fsErr) {
      console.warn('[StoreService updateUserMembership] Firestore sync failed:', fsErr);
    }

    return { hasMembership: true, membership: { id: userId, ...membershipData }, plan: { id: planId, ...planData } };
  }

  async findOrderByQrToken(qrToken: string) {
    let order: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB scan
    try {
      const res = await docClient.send(new ScanCommand({
        TableName: 'StoreAndCommerce',
        FilterExpression: 'qrToken = :token',
        ExpressionAttributeValues: { ':token': qrToken },
        Limit: 1,
      }));
      if (res.Items && res.Items.length > 0) {
        order = { id: (res.Items[0].entityId as string).replace(/^ORDER#/, ''), ...res.Items[0] };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService findOrderByQrToken] DynamoDB scan failed:', dynErr);
    }
    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('storeOrders').where('qrToken', '==', qrToken).limit(1).get();
        if (!snapshot.empty) order = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      } catch (fsErr) {
        console.error('[StoreService findOrderByQrToken] Firestore fallback failed:', fsErr);
      }
    }
    return order;
  }

  async findOrderByJoinToken(joinToken: string) {
    let order: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB scan
    try {
      const res = await docClient.send(new ScanCommand({
        TableName: 'StoreAndCommerce',
        FilterExpression: 'joinToken = :token',
        ExpressionAttributeValues: { ':token': joinToken },
        Limit: 1,
      }));
      if (res.Items && res.Items.length > 0) {
        order = { id: (res.Items[0].entityId as string).replace(/^ORDER#/, ''), ...res.Items[0] };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService findOrderByJoinToken] DynamoDB scan failed:', dynErr);
    }
    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await this.db.collection('storeOrders').where('joinToken', '==', joinToken).limit(1).get();
        if (!snapshot.empty) order = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      } catch (fsErr) {
        console.error('[StoreService findOrderByJoinToken] Firestore fallback failed:', fsErr);
      }
    }
    return order;
  }

  async markCheckedIn(orderId: string, userId: string) {
    const now = Date.now();

    // 1. Update in DynamoDB
    try {
      await docClient.send(new UpdateCommand({
        TableName: 'StoreAndCommerce',
        Key: { entityId: `ORDER#${orderId}`, sk: `ORDER#${orderId}` },
        UpdateExpression: 'SET checkedIn = :t, checkedInAt = :now, updatedAt = :now',
        ExpressionAttributeValues: { ':t': true, ':now': now },
      }));
    } catch (dynErr) {
      console.warn('[StoreService markCheckedIn] DynamoDB update failed:', dynErr);
    }
    // 2. Sync to Firestore
    try {
      const batch = this.db.batch();
      batch.update(this.db.collection('storeOrders').doc(orderId), { checkedIn: true, checkedInAt: new Date(now), updatedAt: FieldValue.serverTimestamp() });
      batch.update(this.db.collection('users').doc(userId).collection('orders').doc(orderId), { checkedIn: true, checkedInAt: new Date(now), updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
    } catch (fsErr) {
      console.warn('[StoreService markCheckedIn] Firestore sync failed:', fsErr);
    }
  }

  async getUserDetails(userId: string) {
    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new GetCommand({
        TableName: 'IdentityAndAccess',
        Key: { entityId: `USER#${userId}`, sk: 'USER#META' },
      }));
      if (res.Item) return res.Item;
    } catch (dynErr) {
      console.warn('[StoreService getUserDetails] DynamoDB get failed:', dynErr);
    }
    // 2. Fallback to Firestore
    try {
      const doc = await this.db.collection('users').doc(userId).get();
      if (!doc.exists) return null;
      return doc.data();
    } catch (fsErr) {
      console.error('[StoreService getUserDetails] Firestore fallback failed:', fsErr);
      return null;
    }
  }

  async getUserAuctions(userId: string, type: 'current' | 'previous' | 'won') {
    if (type === 'won') {
      let wonAuctions: any[] = [];
      let fetchedFromDynamo = false;

      try {
        const res = await docClient.send(new ScanCommand({
          TableName: 'StoreAndCommerce',
          FilterExpression: 'category = :cat AND winnerId = :win AND #st = :s',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':cat': 'Auctions', ':win': userId, ':s': 'closed' },
        }));
        if (res.Items) {
          wonAuctions = res.Items.map(item => ({ id: (item.entityId as string).replace(/^PRODUCT#/, ''), ...item }));
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn('[StoreService getUserAuctions won] DynamoDB scan failed:', dynErr);
      }
      if (!fetchedFromDynamo) {
        const snapshot = await this.db.collection('storeProducts').where('category', 'in', ['Auctions', 'auctions']).where('winnerId', '==', userId).where('status', '==', 'closed').get();
        wonAuctions = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      }
      return wonAuctions;
    }

    const isWinning = type === 'current';
    let productIds: string[] = [];
    let fetchedFromDynamo = false;

    try {
      const res = await docClient.send(new ScanCommand({
        TableName: 'StoreAndCommerce',
        FilterExpression: 'userId = :uid AND isCurrentlyWinning = :w AND begins_with(entityId, :p)',
        ExpressionAttributeValues: { ':uid': userId, ':w': isWinning, ':p': 'BID_ACTIVITY#' },
      }));
      if (res.Items) {
        productIds = res.Items.map(item => item.productId);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[StoreService getUserAuctions activity] DynamoDB scan failed:', dynErr);
    }

    if (!fetchedFromDynamo) {
      try {
        const activitySnapshot = await this.db.collection('userBidActivity').doc(userId).collection('items').where('isCurrentlyWinning', '==', isWinning).get();
        productIds = activitySnapshot.docs.map(doc => doc.id);
      } catch (fsErr) {
        console.warn('[StoreService getUserAuctions activity] Firestore fallback failed:', fsErr);
      }
    }

    if (productIds.length === 0) return [];

    const activeAuctions: any[] = [];
    for (const id of productIds) {
      let prod: any = null;
      try {
        const res = await docClient.send(new GetCommand({ TableName: 'StoreAndCommerce', Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` } }));
        if (res.Item) prod = { id, ...res.Item };
      } catch (dynErr) {}
      if (!prod) {
        try {
          const doc = await this.db.collection('storeProducts').doc(id).get();
          if (doc.exists) prod = { id: doc.id, ...doc.data() };
        } catch (err) {}
      }
      if (prod) {
        prod = await this.checkAndCloseAuctionInline(id, prod);
        if ((prod.category === 'Auctions' || prod.category === 'auctions') && prod.status === 'active') {
          activeAuctions.push(prod);
        }
      }
    }

    return activeAuctions;
  }
}
