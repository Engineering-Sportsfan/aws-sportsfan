"use client";

import {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
} from "react";
import axios from "axios";

/*──────────────────────────────────────────────
  TYPES
──────────────────────────────────────────────*/

export type RoomType = "open" | "inner" | "moment" | "reflection";
export type RoomStatus = "draft" | "published" | "live" | "ended";

export type MediaAsset = {
    url: string;
    type: "video" | "image" | "document" | "slide";
    name: string;
    sizeBytes?: number | null;
    addedAt?: number;
};

export type Room = {
    id?: string;
    hostId: string;
    eventId: string;
    roomType: RoomType;

    title: string;
    titleLower?: string;
    description: string;
    thumbnail: string | null;
    capacity: number | null;
    language: string | null;
    tags: string[];
    scheduledAt: string | null;
    moderators: string[];

    mediaAssets: MediaAsset[];

    price: number | null;

    status: RoomStatus;
    createdAt?: number;
    updatedAt?: number;
    publishedAt?: number;
};

export type Event = {
    id: string;
    name: string;
    sport: string;
    scheduledAt: string;
    status: string;
    thumbnail: string | null;
};

type RoomContextValue = {
    /* state */
    room: Partial<Room>;
    roomId: string | null;
    currentStep: number;
    loading: boolean;
    events: Event[];
    eventsLoading: boolean;

    /* setters */
    setRoom: (updates: Partial<Room>) => void;
    setCurrentStep: (step: number) => void;
    setRoomId: (id: string | null) => void;

    /* API helpers */
    createRoom: (data: Partial<Room>) => Promise<string | null>;   // returns new id
    updateRoom: (id: string, data: Partial<Room>) => Promise<boolean>;
    fetchRoom: (id: string) => Promise<void>;
    publishRoom: (id: string, price?: number) => Promise<boolean>;
    addMediaAsset: (id: string, asset: Omit<MediaAsset, "addedAt">) => Promise<boolean>;
    removeMediaAsset: (id: string, url: string) => Promise<boolean>;
    fetchEvents: (search?: string, sport?: string) => Promise<void>;

    /* list helpers */
    rooms: Room[];
    fetchRooms: (filters?: Record<string, string>) => Promise<void>;
    deleteRoom: (id: string) => Promise<boolean>;
};

/*──────────────────────────────────────────────
  DEFAULTS
──────────────────────────────────────────────*/

const DEFAULT_ROOM: Partial<Room> = {
    hostId: "",
    eventId: "",
    roomType: "open",
    title: "",
    description: "",
    thumbnail: null,
    capacity: null,
    language: null,
    tags: [],
    scheduledAt: null,
    moderators: [],
    mediaAssets: [],
    price: null,
    status: "draft",
};

/*──────────────────────────────────────────────
  CONTEXT
──────────────────────────────────────────────*/

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
    const [room, setRoomState] = useState<Partial<Room>>(DEFAULT_ROOM);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);

    const [rooms, setRooms] = useState<Room[]>([]);
    const [events, setEvents] = useState<Event[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);

    const setRoom = useCallback((updates: Partial<Room>) => {
        setRoomState((prev) => ({ ...prev, ...updates }));
    }, []);

    /* ── CREATE ── */
    const createRoom = useCallback(async (data: Partial<Room>): Promise<string | null> => {
        setLoading(true);
        try {
            const res = await axios.post("/api/rooms", data);
            if (res.data.success) {
                setRoomId(res.data.id);
                setRoomState(res.data.room);
                return res.data.id;
            }
            return null;
        } catch (err) {
            console.error("[RoomContext] createRoom", err);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    /* ── UPDATE ── */
    const updateRoom = useCallback(async (id: string, data: Partial<Room>): Promise<boolean> => {
        setLoading(true);
        try {
            const res = await axios.put(`/api/rooms/${id}`, data);
            return res.data.success;
        } catch (err) {
            console.error("[RoomContext] updateRoom", err);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    /* ── FETCH SINGLE ── */
    const fetchRoom = useCallback(async (id: string): Promise<void> => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/rooms/${id}`);
            if (res.data.success) {
                setRoomState(res.data.room);
                setRoomId(id);
            }
        } catch (err) {
            console.error("[RoomContext] fetchRoom", err);
        } finally {
            setLoading(false);
        }
    }, []);

    /* ── PUBLISH ── */
    const publishRoom = useCallback(async (id: string, price?: number): Promise<boolean> => {
        setLoading(true);
        try {
            const res = await axios.post(`/api/rooms/${id}/publish`, price !== undefined ? { price } : {});
            return res.data.success;
        } catch (err) {
            console.error("[RoomContext] publishRoom", err);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    /* ── MEDIA ── */
    const addMediaAsset = useCallback(async (id: string, asset: Omit<MediaAsset, "addedAt">): Promise<boolean> => {
        try {
            const res = await axios.post(`/api/rooms/${id}/media`, asset);
            if (res.data.success) {
                setRoomState((prev) => ({
                    ...prev,
                    mediaAssets: [...(prev.mediaAssets || []), res.data.asset],
                }));
            }
            return res.data.success;
        } catch (err) {
            console.error("[RoomContext] addMediaAsset", err);
            return false;
        }
    }, []);

    const removeMediaAsset = useCallback(async (id: string, url: string): Promise<boolean> => {
        try {
            const res = await axios.delete(`/api/rooms/${id}/media`, { data: { url } });
            if (res.data.success) {
                setRoomState((prev) => ({
                    ...prev,
                    mediaAssets: (prev.mediaAssets || []).filter((a) => a.url !== url),
                }));
            }
            return res.data.success;
        } catch (err) {
            console.error("[RoomContext] removeMediaAsset", err);
            return false;
        }
    }, []);

    /* ── EVENTS ── */
    const fetchEvents = useCallback(async (search?: string, sport?: string): Promise<void> => {
        setEventsLoading(true);
        try {
            const params: Record<string, string> = {};
            if (search) params.search = search;
            if (sport) params.sport = sport;
            const res = await axios.get("/api/events", { params });
            if (res.data.success) setEvents(res.data.events);
        } catch (err) {
            console.error("[RoomContext] fetchEvents", err);
        } finally {
            setEventsLoading(false);
        }
    }, []);

    /* ── LIST ── */
    const fetchRooms = useCallback(async (filters?: Record<string, string>): Promise<void> => {
        setLoading(true);
        try {
            const res = await axios.get("/api/rooms", { params: filters });
            if (res.data.success) setRooms(res.data.rooms);
        } catch (err) {
            console.error("[RoomContext] fetchRooms", err);
        } finally {
            setLoading(false);
        }
    }, []);

    /* ── DELETE ── */
    const deleteRoom = useCallback(async (id: string): Promise<boolean> => {
        try {
            const res = await axios.delete(`/api/rooms/${id}`);
            if (res.data.success) {
                setRooms((prev) => prev.filter((r) => r.id !== id));
            }
            return res.data.success;
        } catch (err) {
            console.error("[RoomContext] deleteRoom", err);
            return false;
        }
    }, []);

    return (
        <RoomContext.Provider
            value={{
                room,
                roomId,
                currentStep,
                loading,
                events,
                eventsLoading,
                setRoom,
                setCurrentStep,
                setRoomId,
                createRoom,
                updateRoom,
                fetchRoom,
                publishRoom,
                addMediaAsset,
                removeMediaAsset,
                fetchEvents,
                rooms,
                fetchRooms,
                deleteRoom,
            }}
        >
            {children}
        </RoomContext.Provider>
    );
}

export function useRoom(): RoomContextValue {
    const ctx = useContext(RoomContext);
    if (!ctx) throw new Error("useRoom must be used inside <RoomProvider>");
    return ctx;
}