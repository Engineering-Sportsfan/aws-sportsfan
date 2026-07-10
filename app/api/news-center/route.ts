import { NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

export async function GET() {
  try {
    const snapshot = await db
      .collection("news")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get()

    const articles = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data()
      return {
        id:        doc.id,                        // Firestore doc ID (string)
        title:     data.title     ?? "Sports Update",
        summary:   data.summary   ?? "",
        tag:       data.tag       ?? "Cricket",
        source:    data.source    ?? "ESPN CricInfo",
        url:       data.url       ?? "#",
        createdAt: data.createdAt ?? 0,           // number (ms) — frontend formatDate() expects this
        likes:     data.likes     ?? 0,           // number — frontend reads article.likes
        cdn_url:   data.cdn_url   ?? "",          // empty → frontend uses default image
      }
    })

    return NextResponse.json({ articles })

  } catch (err) {
    console.error("Failed to fetch news:", err)
    return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 })
  }
}
