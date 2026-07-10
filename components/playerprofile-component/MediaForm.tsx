"use client";

import axios from "axios";
import { useState } from "react";
import {
  MediaItem,
  SectionTitle,
  AddButton,
  EmptyState,
  FormActions,
  getPreview,
} from "./shared";

//  PROPS

type Props = {
  playerProfilesId: string;
  mediaDocId?: string;
  initialItems?: MediaItem[];
  onSaved: (mediaDocId: string) => void;
  onBack: () => void;
  onFinish: () => void;
};

// ─── COMPONENT ─────────────────────────────────────────────────────────────────

export default function MediaForm({
  playerProfilesId,
  mediaDocId,
  initialItems = [],
  onSaved,
  onBack,
  onFinish,
}: Props) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialItems);
  const [loading, setLoading] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const addMediaItem = () =>
    setMediaItems((p) => [
      ...p,
      { title: "", views: "", time: "", file: null },
    ]);

  const updateMediaItem = (
    i: number,
    key: keyof MediaItem,
    val: string | File | null
  ) => {
    const updated = [...mediaItems];
    (updated[i] as Record<string, unknown>)[key] = val;
    setMediaItems(updated);
  };

  const removeMediaItem = (i: number) =>
    setMediaItems((p) => p.filter((_, idx) => idx !== i));

  // ── Submit 
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("playerProfilesId", playerProfilesId);

      mediaItems.forEach((m, i) => {
        fd.append("titles", m.title || `Media ${i + 1}`);
        fd.append("views", m.views || "0");
        fd.append("times", m.time || "");
        fd.append("existingThumbnails", m.existingThumbnail || "");
        fd.append("thumbnails", m.file || new Blob([]));
      });

      let res;
      if (mediaDocId) {
        res = await axios.put(`/api/player-profile/media/${mediaDocId}`, fd);
        onSaved(mediaDocId);
      } else {
        res = await axios.post("/api/player-profile/media", fd);
        onSaved(res.data.media.id);
      }

      if (res.data.success) {
        alert(mediaDocId ? "Media updated!" : "Media created!");
        onFinish();
      }
    } catch (err) {
      console.error(err);
      alert("Error saving media");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle title="Media Gallery" noMargin />
          <p className="text-xs text-gray-500 mt-1">
            Upload thumbnails and set titles for each media item
          </p>
        </div>
        <AddButton onClick={addMediaItem} label="Add Media" />
      </div>

      {mediaItems.length === 0 && (
        <EmptyState message="No media yet. Click 'Add Media' to begin." />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mediaItems.map((m, i) => {
          const preview = getPreview(m.file, m.existingThumbnail);
          return (
            <div
              key={i}
              className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-3"
            >
              {/* Card header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">
                  Media #{i + 1}
                </span>
                <button
                  onClick={() => removeMediaItem(i)}
                  className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                >
                  Remove
                </button>
              </div>

              {/* Thumbnail preview */}
              {preview && (
                <img
                  src={preview}
                  alt="thumbnail"
                  className="w-full h-28 object-cover rounded border border-[#30363d]"
                />
              )}

              {/* Thumbnail upload */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Thumbnail
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    updateMediaItem(i, "file", e.target.files?.[0] ?? null)
                  }
                  className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white cursor-pointer"
                />
              </div>

              {/* Title */}
              <input
                placeholder="Title (e.g. Virat Kohli's Century Highlights)"
                value={m.title}
                onChange={(e) => updateMediaItem(i, "title", e.target.value)}
                className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />

              {/* Views + Time */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Views
                  </label>
                  <input
                    placeholder="e.g. 2.4M"
                    value={m.views}
                    onChange={(e) =>
                      updateMediaItem(i, "views", e.target.value)
                    }
                    className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Time / Age
                  </label>
                  <input
                    placeholder="e.g. 2h ago"
                    value={m.time}
                    onChange={(e) =>
                      updateMediaItem(i, "time", e.target.value)
                    }
                    className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <FormActions
        onSave={handleSubmit}
        onCancel={onBack}
        loading={loading}
        isEdit={!!mediaDocId}
        saveLabel={mediaDocId ? "Update & Finish" : "Save & Finish"}
        cancelLabel="← Back"
      />
    </div>
  );
}