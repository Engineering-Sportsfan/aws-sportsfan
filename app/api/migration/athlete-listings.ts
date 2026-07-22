import { db } from '../../lib/firebaseAdmin';

export async function migrateAthleteListings() {
  const snapshot = await db
    .collection('storeProducts')
    .where('category', '==', 'athletes')
    .get();

  let updatedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const listings = data.listings || [];
    let modified = false;

    const updatedListings = listings.map((item: any) => {
      const typeStr = (item.type || '').trim();

      // 1. Calculate pricePaise if missing
      let pricePaise = item.pricePaise;
      if (!pricePaise) {
        const rawPrice = (item.price || '').replace(/[^0-9]/g, '');
        const numeric = parseInt(rawPrice, 10) || 0;
        pricePaise = numeric * 100;
        modified = true;
      }

      // 2. Map fulfillmentType automatically
      let fulfillmentType = item.fulfillmentType;
      if (!fulfillmentType) {
        if (typeStr === 'Signed Item') {
          fulfillmentType = 'physical';
        } else if (typeStr === 'Private Call' || typeStr === 'Video Review') {
          fulfillmentType = 'booking';
        } else {
          // Training Program, Video Course, Digital Download
          fulfillmentType = 'library';
        }
        modified = true;
      }

      return {
        ...item,
        pricePaise,
        fulfillmentType,
      };
    });

    if (modified) {
      await doc.ref.update({
        listings: updatedListings,
        updatedAt: new Date().toISOString(),
      });
      updatedCount++;
    }
  }

  return { updatedCount, totalAthletes: snapshot.size };
}
