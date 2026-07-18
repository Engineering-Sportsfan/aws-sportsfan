"use client";

import { useState, useEffect } from "react";
import { X, Users, Globe, Tag, Clock, UserPlus } from "lucide-react";
import axios from "axios";

interface Step2FormData {
  title: string;
  description: string;
  capacity: string;
  primaryLanguage: string;
  tags: string[];
  moderators: string[];
  schedule: string;
  thumbnail?: string;
}

interface CreateRoomStep2Props {
  roomId?: string;
  editId?: string;
  onNext?: (data: FormData) => void;
  onPrev?: () => void;
  initialData?: Step2FormData;
}

export default function CreateRoomStep2({ roomId, editId, onNext, onPrev, initialData }: CreateRoomStep2Props) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [capacity, setCapacity] = useState(initialData?.capacity || "");
  const [primaryLanguage, setPrimaryLanguage] = useState(initialData?.primaryLanguage || "");
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [moderators, setModerators] = useState<string[]>(initialData?.moderators || []);
  const [newModerator, setNewModerator] = useState("");
  const [schedule, setSchedule] = useState(initialData?.schedule || "");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState(initialData?.thumbnail || "");
  const [loading, setLoading] = useState(false);

  // Fetch existing data if in edit mode
  useEffect(() => {
    if (editId && !initialData) {
      fetchExistingData();
    }
  }, [editId]);

  const fetchExistingData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/rooms/${editId}`);
      if (response.data?.success && response.data.room) {
        const room = response.data.room;
        setTitle(room.details?.title || "");
        setDescription(room.details?.description || "");
        setCapacity(room.details?.capacity?.toString() || "");
        setPrimaryLanguage(room.details?.primaryLanguage || "");
        setTags(room.details?.tags || []);
        setModerators(room.details?.moderators || []);
        setSchedule(room.details?.schedule || "");
        setThumbnailPreview(room.details?.thumbnail || "");
      }
    } catch (error) {
      console.error("Failed to fetch room details:", error);
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const addModerator = () => {
    if (newModerator && !moderators.includes(newModerator)) {
      setModerators([...moderators, newModerator]);
      setNewModerator("");
    }
  };

  const removeModerator = (moderator: string) => {
    setModerators(moderators.filter((m) => m !== moderator));
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnail(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = () => {
    if (!title) {
      alert("Please enter a room title");
      return;
    }

    const formData = new FormData();
    const targetId = roomId || editId;
    if (targetId) formData.append("roomId", targetId);
    formData.append("step", "2");
    formData.append("title", title);
    formData.append("description", description);
    formData.append("capacity", capacity);
    formData.append("primaryLanguage", primaryLanguage);
    formData.append("tags", JSON.stringify(tags));
    formData.append("moderators", JSON.stringify(moderators));
    formData.append("schedule", schedule);
    if (thumbnail) formData.append("thumbnail", thumbnail);

    onNext?.(formData);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="text-white">Loading room details...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-neutral-900 rounded-2xl border border-neutral-800 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Step 2: Room Details</h1>
          <button onClick={onPrev} className="text-neutral-400 hover:text-white">← Back</button>
        </div>

        {/* Room Title */}
        <div className="space-y-2">
          <label className="text-white text-sm font-medium">Room Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 60))}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white"
            placeholder="Enter room title..."
            maxLength={60}
          />
          <p className="text-neutral-500 text-xs">{title.length} / 60 characters</p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-white text-sm font-medium">Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white"
            placeholder="Describe what fans can expect from this room..."
            maxLength={200}
          />
          <p className="text-neutral-500 text-xs">{description.length} / 200 characters</p>
        </div>

        {/* Thumbnail */}
        <div className="space-y-2">
          <label className="text-white text-sm font-medium">Thumbnail</label>
          {thumbnailPreview && (
            <img src={thumbnailPreview} alt="Thumbnail preview" className="w-32 h-32 rounded-lg object-cover" />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleThumbnailChange}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white file:mr-2 file:py-1 file:px-3 file:rounded file:bg-orange-500 file:text-white file:border-0"
          />
          <p className="text-neutral-500 text-xs">PNG, JPG up to 5MB • Recommended: 1920×1080</p>
        </div>

        {/* Capacity + Language */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-white text-sm font-medium">
              <Users className="w-4 h-4" /> Capacity
            </label>
            <select
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white"
            >
              <option value="">Select capacity</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="5000">5000</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-white text-sm font-medium">
              <Globe className="w-4 h-4" /> Primary Language
            </label>
            <select
              value={primaryLanguage}
              onChange={(e) => setPrimaryLanguage(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white"
            >
              <option value="">Select language</option>
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Tamil">Tamil</option>
              <option value="Telugu">Telugu</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-white text-sm font-medium">
            <Tag className="w-4 h-4" /> Category Tags
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 bg-neutral-800 px-3 py-1 rounded-full text-white text-sm">
                {tag}
                <button onClick={() => removeTag(tag)} className="text-neutral-400 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addTag()}
              placeholder="Add a tag..."
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 text-white"
            />
            <button onClick={addTag} className="px-4 py-2 bg-neutral-700 rounded-lg text-white">Add</button>
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-white text-sm font-medium">
            <Clock className="w-4 h-4" /> Schedule
          </label>
          <input
            type="datetime-local"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white"
          />
          <p className="text-orange-500 text-xs">Fans are notified 15 min before start</p>
        </div>

        {/* Moderators */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-white text-sm font-medium">
            <UserPlus className="w-4 h-4" /> Moderators (opt-in)
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {moderators.map((mod) => (
              <span key={mod} className="flex items-center gap-1 bg-neutral-800 px-3 py-1 rounded-full text-white text-sm">
                {mod}
                <button onClick={() => removeModerator(mod)} className="text-neutral-400 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newModerator}
              onChange={(e) => setNewModerator(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addModerator()}
              placeholder="Search fan by username..."
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 text-white"
            />
            <button onClick={addModerator} className="px-4 py-2 bg-neutral-700 rounded-lg text-white">Add</button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <button onClick={onPrev} className="px-6 py-2 bg-neutral-800 rounded-lg text-white">Previous</button>
          <button onClick={handleSubmit} className="px-6 py-2 bg-orange-500 rounded-lg text-white font-semibold">
            Next: Content →
          </button>
        </div>
      </div>
    </div>
  );
}