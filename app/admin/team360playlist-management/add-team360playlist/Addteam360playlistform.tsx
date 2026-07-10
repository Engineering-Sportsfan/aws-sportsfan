"use client";

import React, { useEffect, useState } from "react";
import dynamicImport from "next/dynamic";
import { useSearchParams } from "next/navigation";

const AddTeam360Playlist = dynamicImport(
  () =>
    import(
      "@/components/team360-playlist-component/team360-playlist-component"
    ),
  { ssr: false }
);

const Team360Page: React.FC = () => {
  const searchParams = useSearchParams();
  const [team360playlistId, setTeam360PlaylistId] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    const id =
      searchParams.get("id") ||
      searchParams.get("team360playlistId") ||
      undefined;

    setTeam360PlaylistId(id);
  }, [searchParams]);

  return (
    <div>
      <div className="my-5">
        <AddTeam360Playlist
          playlistIdToEdit={team360playlistId}
        />
      </div>
    </div>
  );
};

export default Team360Page;