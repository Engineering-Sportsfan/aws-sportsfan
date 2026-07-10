'use client';

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const AddPlayer360 = dynamicImport(
  () => import('@/components/player360-component/Addplayer360form'),
  { ssr: false }
);

const Player360Page: React.FC = () => {
  const searchParams = useSearchParams();
  const [player360Id, setPlayer360Id] = useState<string | undefined>(undefined);

  useEffect(() => {
    const id = searchParams.get('id') || searchParams.get('player360Id') || undefined;
    setPlayer360Id(id);
  }, [searchParams]);

  return (
    <div>
      <div className="my-5">
      
        <AddPlayer360 player360IdToEdit={player360Id} />
        
      </div>

     
    </div>
  );
};

export default Player360Page;

