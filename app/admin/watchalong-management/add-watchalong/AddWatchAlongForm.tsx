'use client';

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';


const AddWatchAlong = dynamicImport(
  () => import('@/components/Watchalong-component/WatchAlong'),
  { ssr: false }
);

const CricketArticlePage: React.FC = () => {
  const searchParams = useSearchParams();
  const [roomId, setRoomId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const id = searchParams.get('id') || searchParams.get('roomId') || undefined;
    setRoomId(id);
  }, [searchParams]);

  return (
    <div>
      <div className="my-5">
      
        <AddWatchAlong roomIdToEdit={roomId} />
        
      </div>

     
    </div>
  );
};

export default CricketArticlePage;

