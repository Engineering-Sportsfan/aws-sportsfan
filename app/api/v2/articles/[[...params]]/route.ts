// api/v2/articles/[[...params]]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { docClient } from '@/lib/dynamodb';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ params?: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const pathParams = resolvedParams.params || [];

    if (pathParams.length === 0) {
      // GET /api/v2/articles
      let list: any[] = [];
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB Scan
      try {
        const scanRes = await docClient.send(new ScanCommand({
          TableName: 'SocialAndContent',
          FilterExpression: 'begins_with(contentId, :p)',
          ExpressionAttributeValues: { ':p': 'ARTICLE#' }
        }));
        if (scanRes.Items && scanRes.Items.length > 0) {
          list = scanRes.Items.map((item) => ({
            slug: (item.contentId as string).replace(/^ARTICLE#/, ''),
            heroImage: item.heroImage,
            title: item.title,
            author: item.author,
            readTime: item.readTime,
            date: item.date,
            likeCount: item.likeCount,
            commentCount: item.commentCount,
          }));
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn('[V2 Articles GET list] DynamoDB scan failed:', dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo || list.length === 0) {
        try {
          const snapshot = await db.collection('articles').get();
          list = snapshot.docs.map((doc) => ({
            slug: doc.id,
            heroImage: doc.data().heroImage,
            title: doc.data().title,
            author: doc.data().author,
            readTime: doc.data().readTime,
            date: doc.data().date,
            likeCount: doc.data().likeCount,
            commentCount: doc.data().commentCount,
          }));
        } catch (fsErr) {
          console.error('[V2 Articles GET list] Firestore fallback failed:', fsErr);
        }
      }

      return NextResponse.json(list);
    } else if (pathParams.length === 1) {
      // GET /api/v2/articles/:slug
      const slug = pathParams[0];
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
        console.warn('[V2 Articles GET detail] DynamoDB query failed:', dynErr);
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
          console.error('[V2 Articles GET detail] Firestore fallback failed:', fsErr);
        }
      }

      if (!articleData) {
        return NextResponse.json({ error: `Article "${slug}" not found` }, { status: 404 });
      }
      return NextResponse.json(articleData);
    }

    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
