"use client";

import { useState, useEffect } from "react";
import axios from "axios";

interface Step4FormData {
  pricePerFan: number;
  currency: string;
}

interface RoomPreviewData {
  title: string;
  tags: string[];
  maxCapacity: number;
  scheduledTime: string;
  roomType: string;
}

interface CreateRoomStep4Props {
  roomId?: string;
  editId?: string;
  onNext?: (data: FormData) => void;
  onPrev?: () => void;
  initialData?: Step4FormData;
}

export default function CreateRoomStep4({ roomId, editId, onNext, onPrev, initialData }: CreateRoomStep4Props) {
  const [price, setPrice] = useState(initialData?.pricePerFan || 49);
  const [currency, setCurrency] = useState(initialData?.currency || "INR");
  const [isPublishing, setIsPublishing] = useState(false);
  const [roomPreview, setRoomPreview] = useState<RoomPreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const minPrice = 29;
  const maxPrice = 999;
  const maxCapacity = roomPreview?.maxCapacity || 1000;
  const attendanceRange = { low: 0.6, high: 0.8 };
  const attendanceLow = Math.round(maxCapacity * attendanceRange.low);
  const attendanceHigh = Math.round(maxCapacity * attendanceRange.high);
  const earningsLow = attendanceLow * price;
  const earningsHigh = attendanceHigh * price;

  const formatCurrency = (val: number) => `${currency}${val.toLocaleString("en-IN")}`;

  // Fetch existing data if in edit mode
  useEffect(() => {
    if (editId) {
      fetchExistingData();
    }
  }, [editId]);

  const fetchExistingData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/rooms/${editId}`);
      if (response.data?.success && response.data.room) {
        const room = response.data.room;
        
        // Set pricing data
        if (room.pricing) {
          setPrice(room.pricing.pricePerFan || 49);
          setCurrency(room.pricing.currency || "INR");
        }
        
        // Set preview data
        setRoomPreview({
          title: room.details?.title || "Room Title",
          tags: room.details?.tags || [],
          maxCapacity: room.details?.capacity || 1000,
          scheduledTime: room.details?.schedule ? new Date(room.details.schedule).toLocaleString() : "Schedule TBD",
          roomType: room.event?.roomType || "Open Room",
        });
      }
    } catch (error) {
      console.error("Failed to fetch room pricing:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setIsPublishing(true);
    
    const formData = new FormData();
    const targetId = roomId || editId;
    if (targetId) formData.append("roomId", targetId);
    formData.append("step", "4");
    formData.append("pricePerFan", price.toString());
    formData.append("currency", currency);
    formData.append("status", "published");

    onNext?.(formData);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="text-white">Loading pricing data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-neutral-900 rounded-2xl border border-neutral-800 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Step 4: Pricing & Review</h1>
          <button onClick={onPrev} className="text-neutral-400 hover:text-white">← Back</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Pricing Section */}
          <div className="space-y-6">
            <div>
              <label className="text-white text-sm font-medium mb-2 block">Price per Fan</label>
              <div className="flex items-center gap-2 bg-neutral-800 rounded-xl px-4 py-3 border border-neutral-700">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="bg-transparent text-white text-xl font-semibold outline-none"
                >
                  <option value="₹">₹ INR</option>
                  <option value="$">$ USD</option>
                  <option value="€">€ EUR</option>
                  <option value="£">£ GBP</option>
                </select>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Math.min(maxPrice, Math.max(minPrice, parseInt(e.target.value) || 0)))}
                  className="bg-transparent text-white text-xl font-semibold w-full outline-none"
                  min={minPrice}
                  max={maxPrice}
                />
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-neutral-500">Recommended: {currency}{minPrice} – {currency}{maxPrice}</span>
                <span className="text-orange-400">{maxCapacity.toLocaleString()} max capacity</span>
              </div>
            </div>

            {/* Revenue Projection */}
            <div className="bg-neutral-800 rounded-xl p-4 border border-green-900/40">
              <p className="text-green-400 font-semibold text-sm mb-1">Revenue Projection</p>
              <p className="text-neutral-400 text-xs mb-3">Based on your current audience reach</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Expected Attendance:</span>
                  <span className="text-neutral-200">{attendanceLow}–{attendanceHigh} fans</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Estimated Earnings:</span>
                  <span className="text-green-400 font-bold">
                    {formatCurrency(earningsLow)} – {formatCurrency(earningsHigh)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Room Preview */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold">Room Preview</h3>
            <div className="bg-neutral-800 rounded-2xl p-4 border border-neutral-700">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">DRAFT</span>
                <span className="text-neutral-400 text-sm">{roomPreview?.roomType || "Open Room"}</span>
              </div>
              <h4 className="text-white font-bold text-lg mb-2">{roomPreview?.title || "Room Title"}</h4>
              <p className="text-neutral-400 text-xs mb-3">{roomPreview?.tags?.join(" • ") || "Tags will appear here"}</p>
              <div className="flex items-center gap-4 text-xs text-neutral-400 mb-4">
                <span>👥 {maxCapacity.toLocaleString()} max</span>
                <span>🕐 {roomPreview?.scheduledTime || "Schedule TBD"}</span>
              </div>
              <div className="bg-neutral-900 rounded-xl p-3 space-y-3">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Price per Fan</span>
                  <span className="text-white font-bold">{currency}{price}</span>
                </div>
                <button className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white font-semibold py-2 rounded-xl">
                  Subscribe & Enter
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-neutral-800">
          <button onClick={onPrev} className="px-6 py-2 bg-neutral-800 rounded-lg text-white">Previous</button>
          <button
            onClick={handleSubmit}
            disabled={isPublishing}
            className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg text-white font-semibold disabled:opacity-50"
          >
            {isPublishing ? "Publishing..." : "Publish Room →"}
          </button>
        </div>
      </div>
    </div>
  );
}