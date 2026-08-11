// api/v2/articles/[slug]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const slug = resolvedParams.slug;
    
    let articleData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Query
    try {
      const queryRes = await docClient.send(new QueryCommand({
        TableName: 'SocialAndContent',
        KeyConditionExpression: 'contentId = :pk',
        ExpressionAttributeValues: { ':pk': `ARTICLE#${slug}` }
      }));
      if (queryRes.Items && queryRes.Items.length > 0) {
        articleData = {
          slug,
          ...queryRes.Items[0]
        };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[V2 Article GET slug] DynamoDB query failed:', dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const doc = await db.collection('articles').doc(slug).get();
        if (doc.exists) {
          articleData = {
            slug: doc.id,
            ...doc.data(),
          };
        }
      } catch (fsErr) {
        console.error('[V2 Article GET slug] Firestore fallback failed:', fsErr);
      }
    }

    if (!articleData) {
      return NextResponse.json({ error: `Article "${slug}" not found` }, { status: 404 });
    }
    return NextResponse.json(articleData);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
