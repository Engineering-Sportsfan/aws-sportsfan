"use client";

import { useState, useEffect } from "react";
import axios from "axios";

interface RoomType {
  id: "open" | "inner" | "moment" | "reflection";
  label: string;
  description: string;
  badge: string;
  badgeColor: string;
}

const ROOM_TYPES: RoomType[] = [
  {
    id: "open",
    label: "Open Room",
    description: "Free for all fans",
    badge: "FREE",
    badgeColor: "bg-green-500",
  },
  {
    id: "inner",
    label: "Inner Room",
    description: "Subscription required",
    badge: "PREMIUM",
    badgeColor: "bg-blue-500",
  },
  {
    id: "moment",
    label: "Moment Room",
    description: "Time-bound exclusive",
    badge: "LIMITED",
    badgeColor: "bg-pink-500",
  },
  {
    id: "reflection",
    label: "Reflection Room",
    description: "Post-event analysis",
    badge: "ARCHIVE",
    badgeColor: "bg-zinc-600",
  },
];

interface Step1FormData {
  eventName: string;
  roomType: string;
}

interface CreateRoomStep1Props {
  editId?: string;
  onNext?: (data: Step1FormData) => void;
  initialData?: Step1FormData;
}

export default function CreateRoomStep1({ editId, onNext, initialData }: CreateRoomStep1Props) {
  const [fetchingExisting, setFetchingExisting] = useState(false);
  const [eventName, setEventName] = useState(initialData?.eventName || "");
  const [selectedRoomType, setSelectedRoomType] = useState<string>(initialData?.roomType || "open");

  // Fetch existing room data if in edit mode
  useEffect(() => {
    if (editId) {
      fetchExistingRoom();
    }
  }, [editId]);

  const fetchExistingRoom = async () => {
    setFetchingExisting(true);
    try {
      const response = await axios.get(`/api/hostrooms/${editId}`);
      if (response.data?.success && response.data.room) {
        const room = response.data.room;
        setSelectedRoomType(room.event?.roomType || "open");
        setEventName(room.event?.selectedEvent?.name || "");
      }
    } catch (error) {
      console.error("Failed to fetch existing room:", error);
    } finally {
      setFetchingExisting(false);
    }
  };

  const handleSubmit = () => {
    if (!eventName.trim()) {
      alert("Please enter an event name");
      return;
    }

    onNext?.({
      eventName: eventName.trim(),
      roomType: selectedRoomType,
    });
  };

  if (fetchingExisting) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="text-white">Loading room data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen -mt-5 lg:-mt-20 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-[#161b22] rounded-2xl border border-neutral-800 p-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">
          {editId ? "Edit Room - Step 1: Event" : "Create New Room - Step 1: Event"}
        </h1>

        {/* Event Name Input */}
        <div className="space-y-2">
          <label className="text-white text-sm font-medium">Event Name *</label>
          <input
            type="text"
            placeholder="Enter event name (e.g., BWF World Tour Finals 2026)"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
          />
          <p className="text-neutral-500 text-xs">
            Enter the name of the sporting event this room will be about
          </p>
        </div>

        {/* Room Type Selection */}
        <div className="space-y-3">
          <h2 className="text-white font-semibold text-lg">Room Type</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ROOM_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedRoomType(type.id)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedRoomType === type.id
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-neutral-700 bg-neutral-800 hover:border-neutral-500"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-semibold">{type.label}</p>
                    <p className="text-neutral-400 text-sm">{type.description}</p>
                  </div>
                  <span className={`${type.badgeColor} text-white text-xs px-2 py-1 rounded-full`}>
                    {type.badge}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg transition-colors"
          >
            Next: Room Details →
          </button>
        </div>
      </div>
    </div>
  );
}