"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface MediaItem {
    id: string;
    title: string;
    fileName: string;
    url: string;
    thumbnailUrl: string;
    resourceType: "image" | "video";
    width?: number;
    height?: number;
    duration?: string;
    durationSeconds?: number;
    size: number;
    sizeFormatted: string;
    format: string;
    createdAt: string;
    createdAtFormatted: string;
}

export default function CricketMediaAdmin() {
    const [mediaFiles, setMediaFiles] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [renamingItem, setRenamingItem] = useState<MediaItem | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [renameSaving, setRenameSaving] = useState(false);
    const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
    const [filterType, setFilterType] = useState<"all" | "image" | "video">("all");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchMedia = useCallback(async (searchTerm?: string) => {
        setLoading(true);
        setError(null);
        try {
            const url = searchTerm
                ? `/api/cloudinary/cricket-media?search=${encodeURIComponent(searchTerm)}`
                : `/api/cloudinary/cricket-media`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Failed to load media");
            setMediaFiles(data.mediaFiles);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load media");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMedia();
    }, [fetchMedia]);

    useEffect(() => {
        const debounce = setTimeout(() => {
            fetchMedia(search || undefined);
        }, 400);
        return () => clearTimeout(debounce);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        setError(null);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setUploadProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("fileName", file.name);

                const res = await fetch("/api/cricket-media", {
                    method: "POST",
                    body: formData,
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || "Upload failed");
            } catch (err) {
                setError(
                    `Failed to upload ${file.name}: ${
                        err instanceof Error ? err.message : "Unknown error"
                    }`
                );
            }
        }

        setUploading(false);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchMedia(search || undefined);
    };

    const handleDelete = async (item: MediaItem) => {
        if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;

        setDeletingId(item.id);
        setError(null);
        try {
            const res = await fetch(
                `/api/cricket-media?publicId=${encodeURIComponent(
                    item.id
                )}&resourceType=${item.resourceType}`,
                { method: "DELETE" }
            );
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Delete failed");
            setMediaFiles((prev) => prev.filter((m) => m.id !== item.id));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete");
        } finally {
            setDeletingId(null);
        }
    };

    const openRename = (item: MediaItem) => {
        setRenamingItem(item);
        setRenameValue(item.fileName.replace(/\.[^/.]+$/, ""));
    };

    const handleRenameSave = async () => {
        if (!renamingItem || !renameValue.trim()) return;

        setRenameSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/cricket-media", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    publicId: renamingItem.id,
                    resourceType: renamingItem.resourceType,
                    newFileName: renameValue.trim(),
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Rename failed");

            setMediaFiles((prev) =>
                prev.map((m) => (m.id === renamingItem.id ? data.media : m))
            );
            setRenamingItem(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to rename");
        } finally {
            setRenameSaving(false);
        }
    };

    const filteredMedia = mediaFiles.filter(
        (m) => filterType === "all" || m.resourceType === filterType
    );

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold">Cricket Media — IndvsSI</h1>
                        <p className="text-sm text-gray-400 mt-1">
                            {mediaFiles.length} item{mediaFiles.length !== 1 ? "s" : ""} in Cloudinary
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
                            id="media-upload-input"
                        />
                        <label
                            htmlFor="media-upload-input"
                            className={`px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition ${
                                uploading
                                    ? "bg-gray-700 text-gray-400 cursor-not-allowed pointer-events-none"
                                    : "bg-blue-600 hover:bg-blue-500 text-white"
                            }`}
                        >
                            {uploading ? "Uploading…" : "+ Upload Media"}
                        </label>
                    </div>
                </div>

                {uploadProgress && (
                    <div className="mb-4 px-4 py-2 rounded-md bg-blue-950 border border-blue-800 text-blue-300 text-sm">
                        {uploadProgress}
                    </div>
                )}

                {error && (
                    <div className="mb-4 px-4 py-2 rounded-md bg-red-950 border border-red-800 text-red-300 text-sm flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
                            ✕
                        </button>
                    </div>
                )}

                {/* Filters */}
                <div className="flex items-center gap-3 mb-6">
                    <input
                        type="text"
                        placeholder="Search by title…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1 max-w-sm px-3 py-2 rounded-md bg-gray-900 border border-gray-800 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-600"
                    />
                    <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-md p-1">
                        {(["all", "image", "video"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setFilterType(t)}
                                className={`px-3 py-1 rounded text-xs font-medium capitalize transition ${
                                    filterType === t
                                        ? "bg-blue-600 text-white"
                                        : "text-gray-400 hover:text-gray-200"
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div
                                key={i}
                                className="aspect-[4/3] rounded-lg bg-gray-900 animate-pulse"
                            />
                        ))}
                    </div>
                ) : filteredMedia.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        No media found{search ? ` for "${search}"` : ""}.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filteredMedia.map((item) => (
                            <div
                                key={item.id}
                                className="group relative rounded-lg overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-700 transition"
                            >
                                <button
                                    onClick={() => setPreviewItem(item)}
                                    className="block w-full aspect-[4/3] relative"
                                >
                                    <img
                                        src={item.thumbnailUrl}
                                        alt={item.title}
                                        className="w-full h-full object-cover"
                                    />
                                    {item.resourceType === "video" && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                            <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                                                <div className="w-0 h-0 border-l-[10px] border-l-white border-y-[6px] border-y-transparent ml-0.5" />
                                            </div>
                                        </div>
                                    )}
                                    {item.duration && (
                                        <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/70 px-1.5 py-0.5 rounded">
                                            {item.duration}
                                        </span>
                                    )}
                                </button>

                                <div className="p-2">
                                    <p className="text-xs font-medium truncate" title={item.title}>
                                        {item.title}
                                    </p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                        {item.sizeFormatted} · {item.format.toUpperCase()}
                                    </p>
                                </div>

                                {/* Hover actions */}
                                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button
                                        onClick={() => openRename(item)}
                                        title="Rename"
                                        className="w-7 h-7 rounded bg-black/70 hover:bg-black/90 flex items-center justify-center text-xs"
                                    >
                                        ✎
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item)}
                                        disabled={deletingId === item.id}
                                        title="Delete"
                                        className="w-7 h-7 rounded bg-black/70 hover:bg-red-900 flex items-center justify-center text-xs disabled:opacity-50"
                                    >
                                        {deletingId === item.id ? "…" : "🗑"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Rename modal */}
            {renamingItem && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 w-full max-w-sm">
                        <h3 className="text-sm font-semibold mb-3">Rename file</h3>
                        <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="w-full px-3 py-2 rounded-md bg-gray-950 border border-gray-800 text-sm mb-4 focus:outline-none focus:border-blue-600"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setRenamingItem(null)}
                                className="px-3 py-1.5 rounded-md text-sm text-gray-400 hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRenameSave}
                                disabled={renameSaving || !renameValue.trim()}
                                className="px-3 py-1.5 rounded-md text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                            >
                                {renameSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview modal */}
            {previewItem && (
                <div
                    className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4"
                    onClick={() => setPreviewItem(null)}
                >
                    <div
                        className="max-w-3xl w-full max-h-[85vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <p className="text-sm font-medium truncate">{previewItem.title}</p>
                            <button
                                onClick={() => setPreviewItem(null)}
                                className="text-gray-400 hover:text-gray-200 text-xl leading-none"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden rounded-lg bg-black flex items-center justify-center">
                            {previewItem.resourceType === "video" ? (
                                <video src={previewItem.url} controls className="max-h-[70vh] max-w-full" />
                            ) : (
                                <img
                                    src={previewItem.url}
                                    alt={previewItem.title}
                                    className="max-h-[70vh] max-w-full object-contain"
                                />
                            )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {previewItem.sizeFormatted} · {previewItem.format.toUpperCase()} ·{" "}
                            {previewItem.createdAtFormatted}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}