"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import axios from "axios";

/*  TYPES  */

export interface DropItem {
  title: string;
  duration: string; // Will be extracted from media file
  description: string; // New field
  mediaUrl: string; // Required
  thumbnail: string; // Optional
  listens: number;
  signals: number;
  engagement: number;
  // No date field - using createdAt from server
  // No badge field - removed
}

export interface Playlist {
  _id: string;
  team360PostId: string;
  audioDrops: DropItem[];
  videoDrops: DropItem[];
  createdAt?: number; // Timestamp
  updatedAt?: number;
}

interface PlaylistPayload {
  team360PostId: string;
  audioDrops: DropItem[];
  videoDrops: DropItem[];
}

/* ================= CONTEXT TYPE ================= */

interface Team360PlaylistContextType {
  playlists: Playlist[];
  singlePlaylist: Playlist | null;
  loading: boolean;
  error: string | null;

  fetchPlaylists: () => Promise<void>;
  fetchSinglePlaylist: (id: string) => Promise<void>;
  createPlaylist: (payload: PlaylistPayload) => Promise<boolean>;
  updatePlaylist: (
    id: string,
    payload: PlaylistPayload
  ) => Promise<boolean>;
  deletePlaylist: (id: string) => Promise<boolean>;
}

/* ================= CONTEXT ================= */

const Team360PlaylistContext = createContext<
  Team360PlaylistContextType | undefined
>(undefined);

/* ================= HOOK ================= */

export const useTeam360Playlist = () => {
  const context = useContext(Team360PlaylistContext);

  if (!context) {
    throw new Error(
      "useTeam360Playlist must be used inside Team360PlaylistProvider"
    );
  }

  return context;
};

/* ================= PROVIDER ================= */

export const Team360PlaylistProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [singlePlaylist, setSinglePlaylist] =
    useState<Playlist | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Base API URL - should come from environment variable
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  /* ================= GET ALL ================= */

  const fetchPlaylists = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await axios.get(
        `${API_BASE_URL}/api/team360-playlist`
      );

      if (res.data.success) {
        setPlaylists(res.data.playlists || []);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch playlists"
      );
    } finally {
      setLoading(false);
    }
  };

  /* ================= GET SINGLE ================= */

  const fetchSinglePlaylist = async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      const res = await axios.get(
        `${API_BASE_URL}/api/team360-playlist/${id}`
      );

      if (res.data.success) {
        setSinglePlaylist(res.data.playlist);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch playlist"
      );
    } finally {
      setLoading(false);
    }
  };

  /* ================= CREATE ================= */

  const createPlaylist = async (
    payload: PlaylistPayload
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Transform payload to match API expectations
      const transformedPayload = {
        team360PostId: payload.team360PostId,
        audioDrops: payload.audioDrops.map(drop => ({
          title: drop.title,
          duration: drop.duration || "",
          description: drop.description || "",
          mediaUrl: drop.mediaUrl,
          thumbnail: drop.thumbnail || "",
          listens: Number(drop.listens) || 0,
          signals: Number(drop.signals) || 0,
          engagement: Number(drop.engagement) || 0,
        })),
        videoDrops: payload.videoDrops.map(drop => ({
          title: drop.title,
          duration: drop.duration || "",
          description: drop.description || "",
          mediaUrl: drop.mediaUrl,
          thumbnail: drop.thumbnail || "",
          listens: Number(drop.listens) || 0,
          signals: Number(drop.signals) || 0,
          engagement: Number(drop.engagement) || 0,
        })),
      };

      const res = await axios.post(
        `${API_BASE_URL}/api/team360-playlist`,
        transformedPayload
      );

      if (res.data.success) {
        setPlaylists((prev) => [...prev, res.data.playlist]);
        return true;
      }

      return false;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create playlist"
      );
      console.error("Create playlist error:", err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  /* ================= UPDATE ================= */

  const updatePlaylist = async (
    id: string,
    payload: PlaylistPayload
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Transform payload to match API expectations
      const transformedPayload = {
        team360PostId: payload.team360PostId,
        audioDrops: payload.audioDrops.map(drop => ({
          title: drop.title,
          duration: drop.duration || "",
          description: drop.description || "",
          mediaUrl: drop.mediaUrl,
          thumbnail: drop.thumbnail || "",
          listens: Number(drop.listens) || 0,
          signals: Number(drop.signals) || 0,
          engagement: Number(drop.engagement) || 0,
        })),
        videoDrops: payload.videoDrops.map(drop => ({
          title: drop.title,
          duration: drop.duration || "",
          description: drop.description || "",
          mediaUrl: drop.mediaUrl,
          thumbnail: drop.thumbnail || "",
          listens: Number(drop.listens) || 0,
          signals: Number(drop.signals) || 0,
          engagement: Number(drop.engagement) || 0,
        })),
      };

      const res = await axios.put(
        `${API_BASE_URL}/api/team360-playlist/${id}`,
        transformedPayload
      );

      if (res.data.success) {
        setPlaylists((prev) =>
          prev.map((item) =>
            item._id === id ? res.data.playlist : item
          )
        );

        setSinglePlaylist(res.data.playlist);

        return true;
      }

      return false;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update playlist"
      );
      console.error("Update playlist error:", err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  /* ================= DELETE ================= */

  const deletePlaylist = async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const res = await axios.delete(
        `${API_BASE_URL}/api/team360-playlist/${id}`
      );

      if (res.data.success) {
        setPlaylists((prev) =>
          prev.filter((item) => item._id !== id)
        );

        return true;
      }

      return false;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete playlist"
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Team360PlaylistContext.Provider
      value={{
        playlists,
        singlePlaylist,
        loading,
        error,
        fetchPlaylists,
        fetchSinglePlaylist,
        createPlaylist,
        updatePlaylist,
        deletePlaylist,
      }}
    >
      {children}
    </Team360PlaylistContext.Provider>
  );
};