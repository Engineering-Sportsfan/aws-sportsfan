// // app/api/cricket-articles/[id]/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { docClient } from "@/lib/dynamodb";
// import { QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// export const dynamic = "force-dynamic";

// type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

// function getIdFromUrl(req: NextRequest): string {
//   const url = new URL(req.url);
//   const parts = url.pathname.split("/");
//   return parts[parts.length - 1];
// }

// // ─── GET: Fetch single article by ID ──────────────────────────────────────────
// export async function GET(req: NextRequest) {
//   try {
//     const id = getIdFromUrl(req);

//     if (!id) {
//       return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
//     }

//     let article: Record<string, unknown> | null = null;

//     // 1. Query DynamoDB SocialAndContent table
//     try {
//       const candidates = [`ARTICLE#${id}`, id];
//       for (const cand of candidates) {
//         const qRes = await docClient.send(
//           new QueryCommand({
//             TableName: "SocialAndContent",
//             KeyConditionExpression: "contentId = :c",
//             ExpressionAttributeValues: { ":c": cand },
//             Limit: 1,
//           })
//         );
//         if (qRes.Items && qRes.Items.length > 0) {
//           article = qRes.Items[0];
//           break;
//         }
//       }
//     } catch (dynErr) {
//       console.warn("DynamoDB article fetch notice:", dynErr);
//     }

//     // 2. Fallback to Firebase
//     if (!article) {
//       try {
//         const docRef = db.collection("cricketArticles").doc(id);
//         const doc = await docRef.get();
//         if (doc.exists) {
//           article = { id: doc.id, ...doc.data() };
//         }
//       } catch (fbErr) {
//         console.warn("Firebase article fetch fallback notice:", fbErr);
//       }
//     }

//     if (!article) {
//       return NextResponse.json({ error: "Article not found" }, { status: 404 });
//     }

//     return NextResponse.json({
//       success: true,
//       article: {
//         id: (article.contentId as string)?.replace(/^ARTICLE#/, "") || article.articleId || id,
//         ...article,
//       },
//     }, { headers: { "Cache-Control": "no-store" } });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("Error fetching article:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── PUT: Update article by ID ────────────────────────────────────────────────
// export async function PUT(req: NextRequest) {
//   try {
//     const id = getIdFromUrl(req);
//     const body = await req.json();

//     if (!id) {
//       return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
//     }

//     const validBadges: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];
//     if (body.badge && !validBadges.includes(body.badge)) {
//       return NextResponse.json({ error: "Invalid badge type" }, { status: 400 });
//     }

//     const allowedFields = ["badge", "title", "description", "readTime", "author", "views", "image", "tags"];
//     const updates: Record<string, unknown> = {
//       updatedAt: Date.now(),
//     };

//     allowedFields.forEach((field) => {
//       if (body[field] !== undefined) {
//         updates[field] = body[field];
//       }
//     });

//     // 1. Update in DynamoDB
//     try {
//       const candidates = [`ARTICLE#${id}`, id];
//       for (const cand of candidates) {
//         const qRes = await docClient.send(
//           new QueryCommand({
//             TableName: "SocialAndContent",
//             KeyConditionExpression: "contentId = :c",
//             ExpressionAttributeValues: { ":c": cand },
//             Limit: 1,
//           })
//         );
//         if (qRes.Items && qRes.Items.length > 0) {
//           const item = qRes.Items[0];
//           await docClient.send(
//             new UpdateCommand({
//               TableName: "SocialAndContent",
//               Key: {
//                 contentId: item.contentId as string,
//                 sk: item.sk as string,
//               },
//               UpdateExpression: "SET title = :t, updatedAt = :u",
//               ExpressionAttributeValues: {
//                 ":t": updates.title || item.title,
//                 ":u": updates.updatedAt,
//               },
//             })
//           );
//           break;
//         }
//       }
//     } catch (dynErr) {
//       console.warn("DynamoDB article update notice:", dynErr);
//     }

//     // 2. Update in Firebase
//     try {
//       const docRef = db.collection("cricketArticles").doc(id);
//       await docRef.update(updates);
//     } catch (fbErr) {
//       console.warn("Firebase article update notice:", fbErr);
//     }

//     return NextResponse.json({
//       success: true,
//       message: "Article updated successfully",
//       updates,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("Error updating article:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── DELETE: Delete article by ID ─────────────────────────────────────────────
// export async function DELETE(req: NextRequest) {
//   try {
//     const id = getIdFromUrl(req);

//     if (!id) {
//       return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
//     }

//     // 1. Delete from DynamoDB
//     try {
//       const candidates = [`ARTICLE#${id}`, id];
//       for (const cand of candidates) {
//         const qRes = await docClient.send(
//           new QueryCommand({
//             TableName: "SocialAndContent",
//             KeyConditionExpression: "contentId = :c",
//             ExpressionAttributeValues: { ":c": cand },
//             Limit: 1,
//           })
//         );
//         if (qRes.Items && qRes.Items.length > 0) {
//           const item = qRes.Items[0];
//           await docClient.send(
//             new DeleteCommand({
//               TableName: "SocialAndContent",
//               Key: {
//                 contentId: item.contentId as string,
//                 sk: item.sk as string,
//               },
//             })
//           );
//           break;
//         }
//       }
//     } catch (dynErr) {
//       console.warn("DynamoDB article delete notice:", dynErr);
//     }

//     // 2. Delete from Firebase
//     try {
//       const docRef = db.collection("cricketArticles").doc(id);
//       await docRef.delete();
//     } catch (fbErr) {
//       console.warn("Firebase article delete notice:", fbErr);
//     }

//     return NextResponse.json({
//       success: true,
//       message: `Article ${id} deleted successfully`,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("Error deleting article:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// app/api/cricket-articles/[id]/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// ─── GET: Fetch single article by ID ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
    }

    let article: Record<string, unknown> | null = null;

    // 1. Query DynamoDB SocialAndContent table.
    //    IMPORTANT: only ever query the ARTICLE#-prefixed contentId here.
    //    A bare `id` (no prefix) fallback was previously tried as a second
    //    candidate, but comment records in this same table store their
    //    `contentId` as the raw article id (no ARTICLE# prefix) — e.g. a
    //    comment on this article has contentId: "<articleId>". That meant
    //    the bare-id fallback could silently match a comment instead of the
    //    article and return the wrong record with Limit:1. Do not
    //    reintroduce a bare-id candidate; if the prefixed lookup fails, fall
    //    through to Firebase below instead.
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c",
          ExpressionAttributeValues: { ":c": `ARTICLE#${id}` },
          Limit: 1,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        article = qRes.Items[0];
      }
    } catch (dynErr) {
      console.warn("DynamoDB article fetch notice:", dynErr);
    }

    // 2. Fallback to Firebase
    if (!article) {
      try {
        const docRef = db.collection("cricketArticles").doc(id);
        const doc = await docRef.get();
        if (doc.exists) {
          article = { id: doc.id, ...doc.data() };
        }
      } catch (fbErr) {
        console.warn("Firebase article fetch fallback notice:", fbErr);
      }
    }

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      article: {
        id: (article.contentId as string)?.replace(/^ARTICLE#/, "") || article.articleId || id,
        ...article,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT: Update article by ID ────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    const body = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
    }

    const validBadges: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];
    if (body.badge && !validBadges.includes(body.badge)) {
      return NextResponse.json({ error: "Invalid badge type" }, { status: 400 });
    }

    const allowedFields = ["badge", "title", "description", "readTime", "author", "views", "image", "tags"];
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    });

    // 1. Update in DynamoDB.
    //    Same fix as GET: only look up the ARTICLE#-prefixed contentId, never
    //    a bare id, to avoid ever touching a comment record that shares the
    //    same raw id.
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c",
          ExpressionAttributeValues: { ":c": `ARTICLE#${id}` },
          Limit: 1,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        const item = qRes.Items[0];
        await docClient.send(
          new UpdateCommand({
            TableName: "SocialAndContent",
            Key: {
              contentId: item.contentId as string,
              sk: item.sk as string,
            },
            UpdateExpression: "SET title = :t, updatedAt = :u",
            ExpressionAttributeValues: {
              ":t": updates.title || item.title,
              ":u": updates.updatedAt,
            },
          })
        );
      }
    } catch (dynErr) {
      console.warn("DynamoDB article update notice:", dynErr);
    }

    // 2. Update in Firebase
    try {
      const docRef = db.collection("cricketArticles").doc(id);
      await docRef.update(updates);
    } catch (fbErr) {
      console.warn("Firebase article update notice:", fbErr);
    }

    return NextResponse.json({
      success: true,
      message: "Article updated successfully",
      updates,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: Delete article by ID ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB.
    //    Same fix: only the ARTICLE#-prefixed contentId, never a bare id.
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c",
          ExpressionAttributeValues: { ":c": `ARTICLE#${id}` },
          Limit: 1,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        const item = qRes.Items[0];
        await docClient.send(
          new DeleteCommand({
            TableName: "SocialAndContent",
            Key: {
              contentId: item.contentId as string,
              sk: item.sk as string,
            },
          })
        );
      }
    } catch (dynErr) {
      console.warn("DynamoDB article delete notice:", dynErr);
    }

    // 2. Delete from Firebase
    try {
      const docRef = db.collection("cricketArticles").doc(id);
      await docRef.delete();
    } catch (fbErr) {
      console.warn("Firebase article delete notice:", fbErr);
    }

    return NextResponse.json({
      success: true,
      message: `Article ${id} deleted successfully`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
