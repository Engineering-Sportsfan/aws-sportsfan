"use client";

import { useState, useEffect } from "react";
import { X, Upload, FileText } from "lucide-react";
import axios from "axios";

interface Asset {
  id: string;
  type: "video" | "image" | "slide";
  file?: File;
  preview?: string;
  name: string;
  url?: string;
}

interface CreateRoomStep3Props {
  roomId?: string;
  editId?: string;
  onNext?: (data: FormData) => void;
  onPrev?: () => void;
  initialData?: {
    assets: Asset[];
  };
}

export default function CreateRoomStep3({ roomId, editId, onNext, onPrev, initialData }: CreateRoomStep3Props) {
  const [assets, setAssets] = useState<Asset[]>(initialData?.assets || []);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch existing assets if in edit mode
  useEffect(() => {
    if (editId && !initialData) {
      fetchExistingAssets();
    }
  }, [editId]);

  const fetchExistingAssets = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/rooms/${editId}`);
      if (response.data?.success && response.data.room) {
        const existingAssets = response.data.room.content?.assets || [];
        const formattedAssets: Asset[] = existingAssets.map((asset: { type: "video" | "image" | "slide"; url: string; name: string }, index: number) => ({
          id: `existing-${index}`,
          type: asset.type,
          url: asset.url,
          name: asset.name,
          preview: asset.url,
        }));
        setAssets(formattedAssets);
      }
    } catch (error) {
      console.error("Failed to fetch assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newAssets: Asset[] = Array.from(files).map((file, index) => {
      let type: Asset["type"] = "image";
      if (file.type.startsWith("video/")) type = "video";
      else if (file.type.includes("pdf") || file.type.includes("presentation")) type = "slide";

      return {
        id: `${Date.now()}-${index}`,
        type,
        file,
        preview: URL.createObjectURL(file),
        name: file.name,
      };
    });

    setAssets([...assets, ...newAssets]);
  };

  const removeAsset = (id: string) => {
    setAssets(assets.filter((asset) => asset.id !== id));
  };

  const handleSubmit = () => {
    const formData = new FormData();
    const targetId = roomId || editId;
    if (targetId) formData.append("roomId", targetId);
    formData.append("step", "3");

    // Track which existing assets to keep
    const existingAssetUrls: string[] = [];
    assets.forEach((asset) => {
      if (asset.file) {
        formData.append("assets", asset.file);
      } else if (asset.url) {
        existingAssetUrls.push(asset.url);
      }
    });
    
    formData.append("existingAssets", JSON.stringify(existingAssetUrls));

    onNext?.(formData);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="text-white">Loading assets...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-neutral-900 rounded-2xl border border-neutral-800 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Step 3: Content & Media</h1>
          <button onClick={onPrev} className="text-neutral-400 hover:text-white">← Back</button>
        </div>

        {/* Upload Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFileSelect(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
            dragging ? "border-orange-500 bg-orange-500/10" : "border-neutral-700 bg-neutral-800/50"
          }`}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <Upload className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">Add Content Assets</p>
          <p className="text-neutral-400 text-sm mb-4">
            Upload videos, slides, or other materials you&apos;ll share during the room
          </p>
          <input
            id="file-input"
            type="file"
            multiple
            accept="video/*,image/*,.pdf,.ppt,.pptx"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <button className="px-5 py-2 bg-neutral-700 rounded-lg text-white hover:bg-neutral-600">
            Browse Files
          </button>
        </div>

        {/* Assets List */}
        {assets.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-white font-semibold">Uploaded Assets ({assets.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {assets.map((asset) => (
                <div key={asset.id} className="bg-neutral-800 rounded-lg p-3 relative group">
                  <button
                    onClick={() => removeAsset(asset.id)}
                    className="absolute top-2 right-2 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>

                  {asset.type === "image" && asset.preview && (
                    <img src={asset.preview} alt={asset.name} className="w-full h-32 object-cover rounded-lg" />
                  )}
                  {asset.type === "video" && asset.preview && (
                    <video src={asset.preview} className="w-full h-32 object-cover rounded-lg" controls />
                  )}
                  {asset.type === "slide" && (
                    <div className="w-full h-32 bg-neutral-700 rounded-lg flex items-center justify-center">
                      <FileText className="w-12 h-12 text-neutral-400" />
                    </div>
                  )}

                  <p className="text-white text-sm mt-2 truncate">{asset.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <button onClick={onPrev} className="px-6 py-2 bg-neutral-800 rounded-lg text-white">Previous</button>
          <button
            onClick={handleSubmit}
            disabled={assets.length === 0}
            className="px-6 py-2 bg-orange-500 rounded-lg text-white font-semibold disabled:opacity-50"
          >
            Next: Pricing →
          </button>
        </div>
      </div>
    </div>
  );
}