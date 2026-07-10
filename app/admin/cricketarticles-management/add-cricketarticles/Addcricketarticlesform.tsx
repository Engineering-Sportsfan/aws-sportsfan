'use client';

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';


const AddCricketArticle = dynamicImport(
  () => import('@/components/cricketarticles-component/Addcricketarticlesform'),
  { ssr: false }
);

const CricketArticlePage: React.FC = () => {
  const searchParams = useSearchParams();
  const [articleId, setArticleId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const id = searchParams.get('id') || searchParams.get('articleId') || undefined;
    setArticleId(id);
  }, [searchParams]);

  return (
    <div>
      <div className="my-5">
      
        <AddCricketArticle articleIdToEdit={articleId} />
        
      </div>

     
    </div>
  );
};

export default CricketArticlePage;

