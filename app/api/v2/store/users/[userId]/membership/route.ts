import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { TABLES } from '@/lib/tableNames';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { fetchUserMembership } from '@/app/api/v2/store/membership.helper';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ userId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const userId = resolvedParams.userId;
    const result = await fetchUserMembership(db, userId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user membership' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ userId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const userId = resolvedParams.userId;
    const body = await request.json().catch(() => ({}));
    const planId = body.planId || body.tier;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // 1. Read plan from DynamoDB StoreAndCommerce first
    let planData: Record<string, any> | null = null;
    let planDocId = planId;

    try {
      const res = await docClient.send(new GetCommand({
        TableName: TABLES.StoreAndCommerce,
        Key: { entityId: `PRODUCT#${planId}`, sk: `PRODUCT#${planId}` },
      }));
      if (res.Item) {
        planData = res.Item as Record<string, any>;
      }
    } catch (dynErr) {
      console.warn('[membership POST] DynamoDB plan get notice:', dynErr);
    }

    // 2. Fallback to Firestore for plan
    if (!planData) {
      try {
        const planDoc = await db.collection('storeProducts').doc(planId).get();
        if (!planDoc.exists) {
          return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        }
        planData = planDoc.data() as Record<string, any>;
        planDocId = planDoc.id;
      } catch (fsErr) {
        console.warn('[membership POST] Firestore plan fallback notice:', fsErr);
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }
    }

    if (!planData) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const durationDays = planData.durationDays || 30;
    const now = new Date();
    const nowMs = now.getTime();
    const renewalDate = new Date(nowMs + durationDays * 86400 * 1000);

    const membershipData = {
      currentPlanId: planId,
      currentPlanName: planData.name || planData.title || 'Membership Plan',
      status: 'active',
      startDate: now.toISOString(),
      renewalDate: renewalDate.toISOString(),
      autoRenew: true,
      updatedAt: nowMs,
    };

    // 3. Write membership to DynamoDB IdentityAndAccess first
    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.IdentityAndAccess,
        Item: {
          entityId: `USER#${userId}`,
          sk: 'MEMBERSHIP',
          ...membershipData,
        },
      }));
    } catch (dynWriteErr) {
      console.warn('[membership POST] DynamoDB membership write notice:', dynWriteErr);
    }

    // 4. Dual-write to Firestore as backup
    try {
      await db.collection('userMemberships').doc(userId).set(membershipData, { merge: true });
    } catch (fsWriteErr) {
      console.warn('[membership POST] Firestore membership write notice:', fsWriteErr);
    }

    return NextResponse.json({
      hasMembership: true,
      membership: { id: userId, ...membershipData },
      plan: { id: planDocId, ...planData },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
