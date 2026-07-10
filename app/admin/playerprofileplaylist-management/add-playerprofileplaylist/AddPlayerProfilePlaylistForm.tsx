'use client';

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';


const AddPlayerProfilesPlaylist = dynamicImport(
  () => import('@/components/playersprofile-playlist-component/playersprofileplaylist'),
  { ssr: false }
);

const PlayerProfilesPlaylistPage: React.FC = () => {
  const searchParams = useSearchParams();
  const [playlistId, setPlaylistId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const id = searchParams.get('id') || searchParams.get('playlistId') || undefined;
    setPlaylistId(id);
  }, [searchParams]);

  return (
    <div>
      <div className="my-5">
      
        <AddPlayerProfilesPlaylist playlistIdToEdit={playlistId} />
        
      </div>

     
    </div>
  );
};

export default PlayerProfilesPlaylistPage;

