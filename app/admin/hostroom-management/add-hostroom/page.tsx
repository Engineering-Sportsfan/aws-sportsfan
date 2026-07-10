import { Suspense } from 'react';
import AddHostPage from './Addhostroomform';

const Loading = () => (
  <div className="container mx-auto px-4 py-8 text-center">
    <h1 className="text-3xl font-bold mb-6">Loading Form...</h1>
  </div>
);

export default function AddHostRoomPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AddHostPage />
    </Suspense>
  );
}


