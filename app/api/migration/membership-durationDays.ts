import { db } from '@/lib/firebaseAdmin';

export async function runMembershipMigration() {
  const snapshot = await db
    .collection('storeProducts')
    .where('category', 'in', ['Memberships', 'memberships'])
    .get();

  let updatedCount = 0;
  const batch = db.batch();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    let durationDays = 30; // default for Monthly
    const nameLower = (data.name || data.title || '').toLowerCase();
    const idLower = doc.id.toLowerCase();

    if (nameLower.includes('yearly') || nameLower.includes('elite') || idLower.includes('yearly') || idLower.includes('elite')) {
      durationDays = 365;
    } else if (nameLower.includes('quarterly') || idLower.includes('quarterly')) {
      durationDays = 90;
    } else if (nameLower.includes('monthly') || idLower.includes('monthly')) {
      durationDays = 30;
    }

    batch.update(doc.ref, { durationDays });
    updatedCount++;
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  return { success: true, updatedCount };
}
