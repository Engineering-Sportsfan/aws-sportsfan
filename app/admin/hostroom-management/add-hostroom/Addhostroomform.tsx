'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

// Define the component props type
interface AddHostRoomProps {
  editId?: string;
}

const AddHostRoom = dynamic<AddHostRoomProps>(
  () => import('@/components/hostrooms-components/CreateRoomPage').then(mod => mod.default || mod),
  { ssr: false }
);

const HostRoomPage: React.FC = () => {
  const searchParams = useSearchParams();
  const [editId, setEditId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const id = searchParams.get('id') || searchParams.get('editId') || undefined;
    setEditId(id);
  }, [searchParams]);

  return (
    <div>
      <div className="my-5">
        <AddHostRoom editId={editId} />
      </div>
    </div>
  );
};

export default HostRoomPage;