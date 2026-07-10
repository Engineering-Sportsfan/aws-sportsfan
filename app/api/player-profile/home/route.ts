import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";




// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const action = searchParams.get("action");
    
//     // Handle count request
//     if (action === "count") {
//       const collectionRef = db.collection("playershome");
//       const playerProfilesId = searchParams.get("playerProfilesId");
//       let query: FirebaseFirestore.Query = collectionRef;
      
//       if (playerProfilesId) {
//         query = query.where("playerProfilesId", "==", playerProfilesId);
//       }
      
//       const snapshot = await query.count().get();
//       const totalCount = snapshot.data().count;
      
//       return NextResponse.json({
//         success: true,
//         totalCount,
//         filtered: !!playerProfilesId,
//         filter: playerProfilesId || null,
//       });
//     }
    
//     const playerProfilesId = searchParams.get("playerProfilesId");
//     const rawSearch = searchParams.get("search")?.trim() || "";
//     const limit = parseInt(searchParams.get("limit") || "20");
//     const lastDocId = searchParams.get("lastDocId");
//     const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

//     // If searching
//     if (rawSearch) {
//       const searchLower = rawSearch.toLowerCase();
      
//       // FIRST: Try prefix search (starts with) - FAST with index
//       const prefixSnap = await db
//         .collection("playershome")
//         .where("playerNameLower", ">=", searchLower)
//         .where("playerNameLower", "<=", searchLower + "\uf8ff")
//         .limit(limit)
//         .get();
      
//       if (!prefixSnap.empty) {
//         return NextResponse.json({
//           success: true,
//           posts: prefixSnap.docs.map(d => ({ id: d.id, ...d.data() })),
//           pagination: { limit, hasMore: prefixSnap.docs.length === limit, nextCursor: null },
//         });
//       }
      
//       // SECOND: Try contains search - Get ALL documents for accurate search
//       console.log("Prefix search found no results, trying contains search for:", searchLower);
      
//       // Get ALL documents (no limit) or increase limit significantly
//       const allDocs = await db.collection("playershome").get(); // Get ALL documents
//       console.log(`Total documents in collection: ${allDocs.size}`);
      
//       const matchedDocs = allDocs.docs.filter(doc => {
//         const data = doc.data();
//         const playerNameLower = data.playerNameLower || "";
//         const playerName = data.playerName || "";
        
//         // Check if search term exists in the name
//         const matches = playerNameLower.includes(searchLower) || 
//                        playerName.toLowerCase().includes(searchLower);
        
//         if (matches) {
//           console.log(`Found match: ${playerName} (ID: ${doc.id})`);
//         }
        
//         return matches;
//       }).slice(0, limit);
      
//       console.log(`Found ${matchedDocs.length} matches for "${searchLower}"`);
      
//       return NextResponse.json({
//         success: true,
//         posts: matchedDocs.map(d => ({ id: d.id, ...d.data() })),
//         pagination: { limit, hasMore: false, nextCursor: null },
//         searchType: "contains",
//         debug: {
//           totalDocsScanned: allDocs.size,
//           matchesFound: matchedDocs.length,
//           searchTerm: searchLower
//         }
//       });
//     }

//     // No search - normal paginated response
//     let query = db.collection("playershome").orderBy("createdAt", "desc");

//     if (playerProfilesId) {
//       query = query.where("playerProfilesId", "==", playerProfilesId);
//     }

//     if (lastDocId && lastDocCreatedAt) {
//       const lastDocRef = db.collection("playershome").doc(lastDocId);
//       const lastDoc = await lastDocRef.get();
//       if (lastDoc.exists) {
//         query = query.startAfter(lastDoc);
//       }
//     }

//     query = query.limit(limit);
//     const snap = await query.get();
//     const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
//     const lastDoc = snap.docs[snap.docs.length - 1];

//     return NextResponse.json({
//       success: true,
//       posts,
//       pagination: {
//         limit,
//         hasMore: posts.length === limit,
//         nextCursor: posts.length === limit
//           ? { lastDocId: lastDoc?.id, lastDocCreatedAt: lastDoc?.data()?.createdAt }
//           : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("Fetch error:", error);
//     return NextResponse.json({ success: false, error: msg }, { status: 500 });
//   }
// }


export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    
    // Handle count request
    if (action === "count") {
      const collectionRef = db.collection("playershome");
      const playerProfilesId = searchParams.get("playerProfilesId");
      let query: FirebaseFirestore.Query = collectionRef;
      
      if (playerProfilesId) {
        query = query.where("playerProfilesId", "==", playerProfilesId);
      }
      
      const snapshot = await query.count().get();
      const totalCount = snapshot.data().count;
      
      return NextResponse.json({
        success: true,
        totalCount,
        filtered: !!playerProfilesId,
        filter: playerProfilesId || null,
      });
    }
    
    const playerProfilesId = searchParams.get("playerProfilesId");
    const rawSearch = searchParams.get("search")?.trim() || "";
    const limit = parseInt(searchParams.get("limit") || "20");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    // If searching
    if (rawSearch) {
      const searchLower = rawSearch.toLowerCase();
      
      // 🔴 NEW: Check if search term is a number (jersey number)
      const isJerseyNumber = /^\d+$/.test(rawSearch);
      
      if (isJerseyNumber) {
        console.log(`Searching by jersey number: ${rawSearch}`);
        
        // Find playerProfilesId by jersey number from playerSeasons
        const seasonQuery = await db
          .collection("playerSeasons")
          .where("season.jerseyNo", "==", rawSearch)
          .get();
        
        if (!seasonQuery.empty) {
          // Get unique player IDs
          const playerIds = [...new Set(seasonQuery.docs.map(doc => doc.data().playerProfilesId))];
          console.log(`Found player IDs for jersey ${rawSearch}:`, playerIds);
          
          // Fetch home posts for these players
          if (playerIds.length > 0) {
            // Use 'in' query (max 10 values)
            const limitedPlayerIds = playerIds.slice(0, 10);
            const postsQuery = await db
              .collection("playershome")
              .where("playerProfilesId", "in", limitedPlayerIds)
              .orderBy("createdAt", "desc")
              .limit(limit)
              .get();
            
            const posts = postsQuery.docs.map(d => ({ id: d.id, ...d.data() }));
            
            return NextResponse.json({
              success: true,
              posts,
              searchType: "jersey",
              jerseyNumber: rawSearch,
              pagination: { limit, hasMore: false, nextCursor: null },
            });
          }
        }
        
        // If no player found with that jersey number, return empty
        return NextResponse.json({
          success: true,
          posts: [],
          searchType: "jersey",
          jerseyNumber: rawSearch,
          message: "No player found with this jersey number",
          pagination: { limit, hasMore: false, nextCursor: null },
        });
      }
      
      // FIRST: Try prefix search (starts with) - FAST with index
      const prefixSnap = await db
        .collection("playershome")
        .where("playerNameLower", ">=", searchLower)
        .where("playerNameLower", "<=", searchLower + "\uf8ff")
        .limit(limit)
        .get();
      
      if (!prefixSnap.empty) {
        return NextResponse.json({
          success: true,
          posts: prefixSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          searchType: "prefix",
          pagination: { limit, hasMore: prefixSnap.docs.length === limit, nextCursor: null },
        });
      }
      
      // SECOND: Try contains search - Get ALL documents for accurate search
      console.log("Prefix search found no results, trying contains search for:", searchLower);
      
      // Get ALL documents (no limit) or increase limit significantly
      const allDocs = await db.collection("playershome").get(); // Get ALL documents
      console.log(`Total documents in collection: ${allDocs.size}`);
      
      const matchedDocs = allDocs.docs.filter(doc => {
        const data = doc.data();
        const playerNameLower = data.playerNameLower || "";
        const playerName = data.playerName || "";
        
        // Check if search term exists in the name
        const matches = playerNameLower.includes(searchLower) || 
                       playerName.toLowerCase().includes(searchLower);
        
        if (matches) {
          console.log(`Found match: ${playerName} (ID: ${doc.id})`);
        }
        
        return matches;
      }).slice(0, limit);
      
      console.log(`Found ${matchedDocs.length} matches for "${searchLower}"`);
      
      return NextResponse.json({
        success: true,
        posts: matchedDocs.map(d => ({ id: d.id, ...d.data() })),
        pagination: { limit, hasMore: false, nextCursor: null },
        searchType: "contains",
        debug: {
          totalDocsScanned: allDocs.size,
          matchesFound: matchedDocs.length,
          searchTerm: searchLower
        }
      });
    }

    // No search - normal paginated response
    let query = db.collection("playershome").orderBy("createdAt", "desc");

    if (playerProfilesId) {
      query = query.where("playerProfilesId", "==", playerProfilesId);
    }

    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("playershome").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(limit);
    const snap = await query.get();
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const lastDoc = snap.docs[snap.docs.length - 1];

    return NextResponse.json({
      success: true,
      posts,
      pagination: {
        limit,
        hasMore: posts.length === limit,
        nextCursor: posts.length === limit
          ? { lastDocId: lastDoc?.id, lastDocCreatedAt: lastDoc?.data()?.createdAt }
          : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Fetch error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST: Create new post linked to player ───────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      playerProfilesId,
      playerName,
      title,
      category,
      likes,
      comments,
      live,
      shares,
      image,
      logo,
      catlogo,
      hasVideo,
    } = body;

    // Validation
    // if (!playerProfilesId || !playerName || !title || !image || !logo) {
    //   return NextResponse.json(
    //     {
    //       success: false,
    //       error:
    //         "playerProfilesId, playerName, title, image and logo are required",
    //     },
    //     { status: 400 }
    //   );
    // }

    const newPost = {
      playerProfilesId,
      playerName,
       playerNameLower: playerName?.trim().toLowerCase() || "",
      title,
      category: category ?? [],
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      live: Number(live) || 0,
      shares: Number(shares) || 0,
      image,
      logo,
      catlogo: catlogo ?? [],
      hasVideo: hasVideo ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("playershome").add(newPost);

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        post: { id: docRef.id, ...newPost },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}