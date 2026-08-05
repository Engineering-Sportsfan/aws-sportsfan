// app/api/news-center/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let articles: any[] = [];

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: "begins_with(contentId, :nPrefix)",
          ExpressionAttributeValues: {
            ":nPrefix": "NEWS#",
          },
          Limit: 50,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        articles = scanRes.Items.map((data) => ({
          id: data.id || (data.contentId as string).replace(/^NEWS#/, ""),
          title: data.title ?? "Sports Update",
          summary: data.summary ?? "",
          tag: data.tag ?? "Cricket",
          source: data.source ?? "ESPN CricInfo",
          url: data.url ?? "#",
          createdAt: data.createdAt ?? 0,
          likes: data.likes ?? 0,
          cdn_url: data.cdn_url ?? "",
        }));
      }
    } catch (e) {
      console.warn("[news-center GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (articles.length === 0 && db) {
      const snapshot = await db
        .collection("news")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      articles = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title ?? "Sports Update",
          summary: data.summary ?? "",
          tag: data.tag ?? "Cricket",
          source: data.source ?? "ESPN CricInfo",
          url: data.url ?? "#",
          createdAt: data.createdAt ?? 0,
          likes: data.likes ?? 0,
          cdn_url: data.cdn_url ?? "",
        };
      });
    }

    articles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ articles });
  } catch (err) {
    console.error("Failed to fetch news:", err);
    return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 });
  }
}