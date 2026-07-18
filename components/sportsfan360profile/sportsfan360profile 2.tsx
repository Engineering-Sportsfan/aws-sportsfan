"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Trash2, GripVertical, X } from "lucide-react";
import Image from "next/image";

type Drop = {
  id: string;
  title: string;
  url: string;
};

type AudioFile = {
  id: string;
  title: string;
  fileName: string;
  url: string;
  duration: string;
  durationSeconds: number;
  size: number;
  sizeFormatted: string;
  format: string;
  createdAt: string;
  createdAtFormatted: string;
  folder: string;
  matchInfo?: {
    team1?: string;
    team2?: string;
    type?: string;
    speaker?: string;
    date?: string;
  };
};

type FormState = {
  name: string;
  about: string;
  drops: Drop[];
};

export default function Sportsfan360ProfileForm({
  profileIdToEdit,
}: {
  profileIdToEdit?: string;
}) {
  const [form, setForm] = useState<FormState>({
    name: "",
    about: "",
    drops: [],
  });

  const [avatar, setAvatar] = useState<File | null>(null);
  const [existingAvatar, setExistingAvatar] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<AudioFile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropSearch, setShowDropSearch] = useState(false);
  const router = useRouter();

  /* FETCH SINGLE PROFILE */
  useEffect(() => {
    if (!profileIdToEdit) return;

    const fetchProfile = async () => {
      try {
        const res = await axios.get(`/api/sportsfan360-profile/${profileIdToEdit}`);
        const profile = res.data.profile;

        setForm({
          name: profile.name || "",
          about: profile.about || "",
          drops: profile.drops || [],
        });

        setExistingAvatar(profile.avatar || "");
      } catch (error) {
        console.error("Failed to fetch profile", error);
      }
    };

    fetchProfile();
  }, [profileIdToEdit]);

  const handleCancel = () => {
    setForm({
      name: "",
      about: "",
      drops: [],
    });
    setAvatar(null);
    setExistingAvatar("");
    setSearchQuery("");
    setShowDropSearch(false);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  /* DROP HANDLERS */
  const searchDrops = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await axios.get(`/api/cloudinary/audio?search=${encodeURIComponent(query)}&limit=10`);
      if (res.data.success && res.data.audioFiles) {
        setSearchResults(res.data.audioFiles);
      }
    } catch (error) {
      console.error("Failed to search drops", error);
    } finally {
      setSearchLoading(false);
    }
  };

  const addDrop = (drop: AudioFile) => {
    // Check if drop already exists
    if (form.drops.some((d) => d.id === drop.id)) {
      alert("This drop is already added");
      return;
    }

    setForm((prev) => ({
      ...prev,
      drops: [
        ...prev.drops,
        {
          id: drop.id,
          title: drop.title,
          url: drop.url,
        },
      ],
    }));
    setShowDropSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeDrop = (index: number) => {
    setForm((prev) => ({
      ...prev,
      drops: prev.drops.filter((_, i) => i !== index),
    }));
  };

  const moveDropUp = (index: number) => {
    if (index === 0) return;
    const updated = [...form.drops];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setForm((prev) => ({ ...prev, drops: updated }));
  };

  const moveDropDown = (index: number) => {
    if (index === form.drops.length - 1) return;
    const updated = [...form.drops];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setForm((prev) => ({ ...prev, drops: updated }));
  };

  /* SUBMIT - Using FormData instead of JSON */
  const handleSubmit = async () => {
    if (!form.name) {
      alert("Name is required");
      return;
    }

    setLoading(true);

    try {
      // Create FormData object
      const formData = new FormData();
      
      // Append basic fields
      formData.append("name", form.name);
      formData.append("about", form.about);
      
      // Append drops as JSON string
      formData.append("drops", JSON.stringify(form.drops));
      
      // Append avatar if a new one is selected
      if (avatar) {
        formData.append("avatar", avatar);
      } else if (existingAvatar) {
        // If editing and no new avatar selected, send the existing avatar URL
        formData.append("existingAvatar", existingAvatar);
      }

      let res;
      if (profileIdToEdit) {
        res = await axios.put(`/api/sportsfan360card/${profileIdToEdit}`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
      } else {
        res = await axios.post("/api/sportsfan360card", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
      }

      if (res.data.success) {
        alert(
          profileIdToEdit
            ? "Profile updated successfully"
            : "Profile created successfully"
        );
        router.push("/admin/sportsfan360-profile/profiles-list");

        if (!profileIdToEdit) {
          setForm({
            name: "",
            about: "",
            drops: [],
          });
          setAvatar(null);
          setExistingAvatar("");
        }
      }
    } catch (error) {
      console.error("Save failed", error);
      alert("Error saving profile");
    } finally {
      setLoading(false);
    }
  };

  const previewAvatar = avatar ? URL.createObjectURL(avatar) : existingAvatar;

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      <h1 className="text-xl font-bold mb-6">
        {profileIdToEdit ? "Edit Sportsfan360 Profile" : "Create Sportsfan360 Profile"}
      </h1>

      <div className="bg-[#161b22] rounded-lg p-6 space-y-6">
        {/* BASIC INFO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Profile Name *"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g., IPL 2026 Official"
          />

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Avatar Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
              className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-500 file:text-white hover:file:bg-blue-600"
            />
            {previewAvatar && (
              <div className="relative w-16 h-16 mt-3">
                <Image
                  src={previewAvatar}
                  alt="avatar preview"
                  fill
                  className="rounded-full object-cover border border-gray-700"
                />
              </div>
            )}
          </div>
        </div>

        {/* ABOUT */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">About</label>
          <textarea
            name="about"
            value={form.about}
            onChange={handleChange}
            placeholder="Tell us about this profile..."
            rows={4}
            className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 resize-y"
          />
        </div>

        {/* DROPS SECTION */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-gray-400">Audio Drops</label>
            <button
              type="button"
              onClick={() => setShowDropSearch(true)}
              className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition"
            >
              <Plus size={14} />
              Add Drop
            </button>
          </div>

          {form.drops.length === 0 ? (
            <div className="text-center text-gray-400 py-8 border border-dashed border-gray-700 rounded-lg">
              No audio drops added yet. Click &apos;Add Drop&apos; to add content.
            </div>
          ) : (
            <div className="space-y-2">
              {form.drops.map((drop, index) => (
                <div
                  key={drop.id}
                  className="flex items-center gap-3 bg-[#0d1117] border border-gray-700 rounded-lg p-3"
                >
                  <GripVertical size={16} className="text-gray-500 cursor-move" />
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {drop.title}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{drop.url}</p>
                  </div>

                  <div className="flex gap-1">
                    {index > 0 && (
                      <button
                        onClick={() => moveDropUp(index)}
                        className="text-gray-400 hover:text-white p-1 transition"
                        title="Move Up"
                      >
                        ↑
                      </button>
                    )}
                    {index < form.drops.length - 1 && (
                      <button
                        onClick={() => moveDropDown(index)}
                        className="text-gray-400 hover:text-white p-1 transition"
                        title="Move Down"
                      >
                        ↓
                      </button>
                    )}
                    <button
                      onClick={() => removeDrop(index)}
                      className="text-red-500 hover:text-red-400 p-1 transition"
                      title="Remove Drop"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading
              ? profileIdToEdit
                ? "Updating..."
                : "Creating..."
              : profileIdToEdit
              ? "Update Profile"
              : "Create Profile"}
          </button>

          <button
            onClick={handleCancel}
            type="button"
            className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* DROP SEARCH MODAL */}
      {showDropSearch && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold">Add Audio Drop</h3>
              <button
                onClick={() => {
                  setShowDropSearch(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="text-gray-400 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-gray-700">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchDrops(e.target.value);
                }}
                placeholder="Search audio drops by title..."
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Search Results */}
            <div className="flex-1 overflow-y-auto p-4">
              {searchLoading ? (
                <div className="text-center text-gray-400 py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  Searching...
                </div>
              ) : searchResults.length === 0 && searchQuery ? (
                <div className="text-center text-gray-400 py-8">
                  No audio drops found for &apos;{searchQuery}&apos;
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  Start typing to search for audio drops
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((drop) => (
                    <button
                      key={drop.id}
                      onClick={() => addDrop(drop)}
                      className="w-full text-left bg-[#0d1117] hover:bg-[#1a1f2e] border border-gray-700 rounded-lg p-3 transition"
                    >
                      <p className="text-sm font-medium text-white">{drop.title}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {drop.matchInfo?.team1 && drop.matchInfo?.team2
                          ? `${drop.matchInfo.team1} vs ${drop.matchInfo.team2}`
                          : "Audio Drop"}
                        {drop.duration && drop.duration !== "0:00" && ` • ${drop.duration}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      <input
        {...props}
        className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}