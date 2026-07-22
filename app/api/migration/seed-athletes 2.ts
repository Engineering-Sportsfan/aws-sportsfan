import { db } from '../../lib/firebaseAdmin';

export async function seedInitialAthletes() {
  const athletesData = [
    {
      id: 'athlete-neeraj-chopra',
      name: 'Neeraj Chopra',
      discipline: 'Javelin Throw',
      category: 'athletes',
      governance_state: 'approved',
      bio: 'Olympic gold medallist and World champion. World record progression guide, training philosophy insights, and signed memorabilia.',
      image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=300&fit=crop&auto=format',
      rewardCoins: 150,
      listings: [
        { id: 'list-1', type: 'Training Program', title: "Neeraj's 12-Week Javelin Power Block", price: '₹4,999', preview: true },
        { id: 'list-2', type: 'Video Review', title: 'Technique Video Review (30 min)', price: '₹2,499', preview: false },
        { id: 'list-3', type: 'Private Call', title: '20-min Private Q&A Call', price: '₹6,999', preview: false },
        { id: 'list-4', type: 'Signed Item', title: 'Signed Training Tee (Authenticated)', price: '₹8,500', preview: false },
      ],
    },
    {
      id: 'athlete-avinash-sable',
      name: 'Avinash Sable',
      discipline: '3000m Steeplechase',
      category: 'athletes',
      governance_state: 'approved',
      bio: 'Asian Games silver medallist and national record holder. Sharing steeplechase fundamentals, training breakdowns, and community events.',
      image: 'https://images.unsplash.com/photo-1544899489-a083461b088c?w=400&h=300&fit=crop&auto=format',
      rewardCoins: 100,
      listings: [
        { id: 'list-1', type: 'Video Course', title: 'Steeplechase Barrier Technique Series', price: '₹3,299', preview: true },
        { id: 'list-2', type: 'Training Program', title: '8-Week Aerobic Base Builder', price: '₹2,999', preview: true },
        { id: 'list-3', type: 'Digital Download', title: 'National Record Training Week PDF', price: '₹499', preview: false },
      ],
    },
    {
      id: 'athlete-tejaswin-shankar',
      name: 'Tejaswin Shankar',
      discipline: 'High Jump',
      category: 'athletes',
      governance_state: 'pending',
      bio: 'Commonwealth Games medalist and NCAA high jump champion. Technical coaching programs and digital content for aspiring high jumpers.',
      image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&h=300&fit=crop&auto=format',
      rewardCoins: 100,
      listings: [
        { id: 'list-1', type: 'Video Course', title: 'Fosbury Flop Mechanics — Full Series', price: '₹3,999', preview: true },
        { id: 'list-2', type: 'Private Call', title: '30-min High Jump Consultation', price: '₹4,999', preview: false },
      ],
    },
  ];

  for (const athlete of athletesData) {
    await db.collection('storeProducts').doc(athlete.id).set(athlete, { merge: true });
  }
}
