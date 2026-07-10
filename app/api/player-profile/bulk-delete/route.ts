// app/api/player-profile/bulk-delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// export async function DELETE(req: NextRequest) {
//   try {
//     const { confirm,  } = await req.json();

//     // Safety check to prevent accidental deletion
//     if (!confirm || confirm !== "DELETE_ALL") {
//       return NextResponse.json(
//         { success: false, message: 'Must confirm with "DELETE_ALL"' },
//         { status: 400 }
//       );
//     }

//     let deletedCount = 0;
//     // const batchSize = 0;
//     let lastDoc = null;
//     const BATCH_LIMIT = 300; // Firestore limit for batch operations

//     // Get all profiles (you'll need to paginate through them)
//     const collectionRef = db.collection("PlayerProfiles");

//     // Method 1: Delete in batches
//     while (true) {
//       let query = collectionRef.limit(BATCH_LIMIT);
//       if (lastDoc) {
//         query = query.startAfter(lastDoc);
//       }

//       const snapshot = await query.get();

//       if (snapshot.empty) {
//         break;
//       }

//       // Delete documents in batch
//       const batch = db.batch();
//       snapshot.docs.forEach((doc) => {
//         batch.delete(doc.ref);
//         deletedCount++;
//       });

//       await batch.commit();
//       lastDoc = snapshot.docs[snapshot.docs.length - 1];

//       if (snapshot.size < BATCH_LIMIT) {
//         break;
//       }
//     }

//     return NextResponse.json({
//       success: true,
//       message: `Successfully deleted ${deletedCount} profiles`,
//       deletedCount
//     });
//   } catch (error) {
//     console.error("Bulk delete error:", error);
//     return NextResponse.json(
//       { 
//         success: false, 
//         message: "Bulk delete failed: " + (error as Error).message 
//       },
//       { status: 500 }
//     );
//   }
// }




export async function DELETE(req: NextRequest) {
  try {
    const { confirm } = await req.json();

    // Safety check to prevent accidental deletion
    if (!confirm || confirm !== "DELETE_ALL") {
      return NextResponse.json(
        { success: false, message: 'Must confirm with "DELETE_ALL"' },
        { status: 400 }
      );
    }

    const results = {
      PlayerProfiles: 0,
      playershome: 0,
      playerMedia: 0,
      playerInsights: 0
    };

    const BATCH_LIMIT = 300; // Firestore limit for batch operations

    // Collection names to delete from
    const collections = [
      "PlayerProfiles",
      "playershome",
      "playerMedia",
      "playerInsights",
      "playerSeasons"
    ];

    // Delete all documents from each collection
    for (const collectionName of collections) {
      let deletedCount = 0;
      let lastDoc = null;

      const collectionRef = db.collection(collectionName);

      console.log(`Deleting all documents from ${collectionName}...`);

      while (true) {
        let query = collectionRef.limit(BATCH_LIMIT);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          break;
        }

        // Delete documents in batch
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
          deletedCount++;
        });

        await batch.commit();
        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        console.log(`Deleted ${deletedCount} documents from ${collectionName} so far...`);

        if (snapshot.size < BATCH_LIMIT) {
          break;
        }
      }

      results[collectionName as keyof typeof results] = deletedCount;
      console.log(`Completed deleting ${deletedCount} documents from ${collectionName}`);
    }

    return NextResponse.json({
      success: true,
      message: "Successfully deleted all player data from all collections",
      deletedCounts: results,
      totalDeleted: Object.values(results).reduce((a, b) => a + b, 0)
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Bulk delete failed: " + (error as Error).message
      },
      { status: 500 }
    );
  }
}