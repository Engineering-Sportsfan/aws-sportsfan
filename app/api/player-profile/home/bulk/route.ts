import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// Move your bulk DELETE operations here
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const batchSize = parseInt(searchParams.get("batchSize") || "100");
    const action = searchParams.get("action");
    const confirm = searchParams.get("confirm");

    // DELETE ALL DATA - Use with extreme caution
    if (action === "all") {
      // Safety check - require explicit confirmation
      if (confirm !== "yes-i-really-want-to-delete-all-data") {
        return NextResponse.json(
          { 
            success: false, 
            message: "⚠️ DANGER: This will delete ALL data in playershome collection. Use confirm='yes-i-really-want-to-delete-all-data' to proceed",
            requiredConfirm: "yes-i-really-want-to-delete-all-data"
          },
          { status: 400 }
        );
      }

      // First, count total documents
      const countSnapshot = await db.collection("playershome").count().get();
      const totalToDelete = countSnapshot.data().count;
      
      if (totalToDelete === 0) {
        return NextResponse.json({
          success: true,
          message: "Collection is already empty",
          deletedCount: 0,
        });
      }

      let deletedCount = 0;
      let lastDoc = null;
      let hasMore = true;
      let batchNumber = 0;
      
      while (hasMore) {
        batchNumber++;
        
        // Build query to get documents in batches
        let query = db.collection("playershome")
          .orderBy("createdAt", "desc")
          .limit(batchSize);
        
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
          hasMore = false;
          break;
        }
        
        // Delete documents in current batch
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        
        deletedCount += snapshot.size;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        // Add delay between batches to avoid rate limiting
        if (snapshot.size === batchSize) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`Batch ${batchNumber} completed: Deleted ${snapshot.size} documents (Total: ${deletedCount}/${totalToDelete})`);
      }
      
      return NextResponse.json({
        success: true,
        message: `✅ Successfully deleted ALL ${deletedCount} player records from playershome collection`,
        deletedCount,
        totalDeleted: deletedCount,
      });
    }

    // Delete old data (before keepMinutes) - Original functionality
    if (action === "old") {
      const keepMinutes = parseInt(searchParams.get("keepMinutes") || "20");
      const cutoffTime = Date.now() - (keepMinutes * 60 * 1000);
      
      const countQuery = db.collection("playershome")
        .where("createdAt", "<", cutoffTime);
      
      const countSnapshot = await countQuery.get();
      const totalToDelete = countSnapshot.size;
      
      if (totalToDelete === 0) {
        return NextResponse.json({
          success: true,
          message: `No old data found before ${keepMinutes} minutes ago`,
          deletedCount: 0,
        });
      }

      let deletedCount = 0;
      let lastDoc = null;
      let hasMore = true;
      let batchNumber = 0;
      
      while (hasMore) {
        batchNumber++;
        
        let query = db.collection("playershome")
          .where("createdAt", "<", cutoffTime)
          .limit(batchSize);
        
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
          hasMore = false;
          break;
        }
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        
        deletedCount += snapshot.size;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        if (snapshot.size === batchSize) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`Batch ${batchNumber} completed: Deleted ${snapshot.size} documents`);
      }
      
      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${deletedCount} old player records (kept data from last ${keepMinutes} minutes)`,
        deletedCount,
        keptMinutes: keepMinutes,
        cutoffTime: new Date(cutoffTime).toISOString(),
      });
    }
    
    // Delete specific duplicates by ID list
    if (action === "duplicates" && searchParams.get("ids")) {
      const ids = searchParams.get("ids")?.split(",") || [];
      
      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, message: "No IDs provided" },
          { status: 400 }
        );
      }
      
      let deletedCount = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const batch = db.batch();
        const batchIds = ids.slice(i, i + 100);
        
        for (const id of batchIds) {
          const docRef = db.collection("playershome").doc(id);
          batch.delete(docRef);
        }
        
        await batch.commit();
        deletedCount += batchIds.length;
        
        if (i + 100 < ids.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${deletedCount} duplicate records`,
        deletedCount,
      });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action. Use 'all', 'old', or 'duplicates'" },
      { status: 400 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[playershome bulk DELETE]", error);
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}