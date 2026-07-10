'use client';

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';


const AddPlayerProfile = dynamicImport(
  () => import('@/components/playerprofile-component/CreatePlayerProfile'),
  { ssr: false }
);

const PlayerProfilePage: React.FC = () => {
  const searchParams = useSearchParams();
  const [articleId, setArticleId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const id = searchParams.get('id') || searchParams.get('articleId') || undefined;
    setArticleId(id);
  }, [searchParams]);

  return (
    <div>
      <div className="my-5">
      
        <AddPlayerProfile profileIdToEdit={articleId} />
        
      </div>

     
    </div>
  );
};

export default PlayerProfilePage;

