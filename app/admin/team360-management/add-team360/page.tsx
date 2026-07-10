import { Suspense } from 'react';
import Team360Page from './Addteam360form';

const Loading = () => (
  <div className="container mx-auto px-4 py-8 text-center">
    <h1 className="text-3xl font-bold mb-6">Loading Form...</h1>
  </div>
);

export default function AddTeam360Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Team360Page />
    </Suspense>
  );
}


