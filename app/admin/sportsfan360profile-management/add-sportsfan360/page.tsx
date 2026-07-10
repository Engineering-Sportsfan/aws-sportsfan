import Sportsfan360ProfileForm from '@/components/sportsfan360profile/sportsfan360profile';
import { Suspense } from 'react';


const Loading = () => (
  <div className="container mx-auto px-4 py-8 text-center">
    <h1 className="text-3xl font-bold mb-6">Loading Form...</h1>
  </div>
);

export default function AddSportsfan360Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Sportsfan360ProfileForm />
    </Suspense>
  );
}


