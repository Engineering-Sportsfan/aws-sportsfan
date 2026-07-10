'use client';

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const AddTeam360 = dynamicImport(
  () => import('@/components/team360-component/Addteam360form'),
  { ssr: false }
);

const Team360Page: React.FC = () => {
  const searchParams = useSearchParams();
  const [team360Id, setTeam360Id] = useState<string | undefined>(undefined);

  useEffect(() => {
    const id = searchParams.get('id') || searchParams.get('team360Id') || undefined;
    setTeam360Id(id);
  }, [searchParams]);

  return (
    <div>
      <div className="my-5">
      
        <AddTeam360 team360IdToEdit={team360Id} />
        
      </div>

     
    </div>
  );
};

export default Team360Page;

