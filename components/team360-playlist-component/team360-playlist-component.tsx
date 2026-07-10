"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DropItem, useTeam360Playlist } from "@/context/Team360PlaylistContext";
import axios from "axios";

type FormState = {
    team360PostId: string;
    teamName: string;
    audioDrops: DropItem[];
    videoDrops: DropItem[];
};

interface Team360Post {
    id: string;
    teamName: string;
    title: string;
    logo: string;
}

export default function CreatePlaylistForm({
    playlistIdToEdit,
    team360playlistPostId,
}: {
    playlistIdToEdit?: string;
    team360playlistPostId?: string;
}) {
    const router = useRouter();

    const {
        singlePlaylist,
        loading,
        fetchSinglePlaylist,
    } = useTeam360Playlist();

    const [form, setForm] = useState<FormState>({
        team360PostId: team360playlistPostId || "",
        teamName: "",
        audioDrops: [],
        videoDrops: [],
    });

    const [team360Posts, setTeam360Posts] = useState<Team360Post[]>([]);
    const [fetchingPosts, setFetchingPosts] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitNotice, setSubmitNotice] = useState<string | null>(null);

    // Store the actual File objects for upload
    const [audioFiles, setAudioFiles] = useState<Record<string, File>>({});
    const [videoFiles, setVideoFiles] = useState<Record<string, File>>({});
    const [audioThumbnails, setAudioThumbnails] = useState<Record<string, File>>({});
    const [videoThumbnails, setVideoThumbnails] = useState<Record<string, File>>({});

    // Fetch Team360 posts for dropdown
    useEffect(() => {
        fetchTeam360Posts();
    }, []);

    const fetchTeam360Posts = async () => {
        try {
            setFetchingPosts(true);
            const response = await axios.get("/api/team360");
            if (response.data?.posts) {
                setTeam360Posts(response.data.posts);
            }
        } catch (error) {
            console.error("Failed to fetch Team360 posts:", error);
        } finally {
            setFetchingPosts(false);
        }
    };

    /* EDIT MODE FETCH */
    useEffect(() => {
        if (playlistIdToEdit) {
            fetchSinglePlaylist(playlistIdToEdit);
        }
    }, [playlistIdToEdit]);

    /* PREFILL FORM */
    useEffect(() => {
        if (singlePlaylist && playlistIdToEdit) {
            // Find the team name from the posts list
            const matchedPost = team360Posts.find(post => post.id === singlePlaylist.team360PostId);
            setForm({
                team360PostId: singlePlaylist.team360PostId,
                teamName: matchedPost?.teamName || "",
                audioDrops: singlePlaylist.audioDrops || [],
                videoDrops: singlePlaylist.videoDrops || [],
            });
        }
    }, [singlePlaylist, playlistIdToEdit, team360Posts]);

    /* Handle Team Selection */
    const handleTeamSelect = (postId: string) => {
        const selectedPost = team360Posts.find(post => post.id === postId);
        setForm((prev) => ({
            ...prev,
            team360PostId: postId,
            teamName: selectedPost?.teamName || "",
        }));
    };

    /* UPDATE DROP */
    const updateDrop = (
        type: "audioDrops" | "videoDrops",
        index: number,
        key: keyof DropItem,
        value: string
    ) => {
        setForm((prev) => {
            const updated = [...prev[type]];
            updated[index] = {
                ...updated[index],
                [key]: value,
            };

            return {
                ...prev,
                [type]: updated,
            };
        });
    };

    /* ADD DROP */
    const addDrop = (type: "audioDrops" | "videoDrops") => {
        setForm((prev) => ({
            ...prev,
            [type]: [
                ...prev[type],
                {
                    title: "",
                    duration: "",
                    mediaUrl: "",
                    description: "",
                    thumbnail: "",
                    listens: "0",
                    signals: "0",
                    engagement: "0",
                },
            ],
        }));
    };

    /* REMOVE DROP */
    const removeDrop = (
        type: "audioDrops" | "videoDrops",
        index: number
    ) => {
        setForm((prev) => ({
            ...prev,
            [type]: prev[type].filter((_, i) => i !== index),
        }));

        const dropKey = `${type}-${index}`;
        if (type === "audioDrops") {
            delete audioFiles[dropKey];
            delete audioThumbnails[dropKey];
        } else {
            delete videoFiles[dropKey];
            delete videoThumbnails[dropKey];
        }
    };

    const hasNewFiles = Object.keys(audioFiles).length > 0 || Object.keys(videoFiles).length > 0;
    const hasExistingDrops = form.audioDrops.length > 0 || form.videoDrops.length > 0;

    /* HANDLE FILE SELECTION */
    const handleFileSelect = (
        e: React.ChangeEvent<HTMLInputElement>,
        dropType: "audioDrops" | "videoDrops",
        dropIndex: number,
        field: "mediaUrl" | "thumbnail"
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isAudio = dropType === "audioDrops";
        const fileType = field === "mediaUrl"
            ? (isAudio ? "audio" : "video")
            : "image";

        if (fileType === "audio" && !file.type.startsWith("audio/")) {
            alert("Please select an audio file");
            return;
        }
        if (fileType === "video" && !file.type.startsWith("video/")) {
            alert("Please select a video file");
            return;
        }
        if (fileType === "image" && !file.type.startsWith("image/")) {
            alert("Please select an image file for thumbnail");
            return;
        }

        const dropKey = `${dropType}-${dropIndex}`;

        if (dropType === "audioDrops") {
            if (field === "mediaUrl") {
                setAudioFiles(prev => ({ ...prev, [dropKey]: file }));
                updateDrop(dropType, dropIndex, field, URL.createObjectURL(file));
            } else {
                setAudioThumbnails(prev => ({ ...prev, [dropKey]: file }));
                updateDrop(dropType, dropIndex, field, URL.createObjectURL(file));
            }
        } else {
            if (field === "mediaUrl") {
                setVideoFiles(prev => ({ ...prev, [dropKey]: file }));
                updateDrop(dropType, dropIndex, field, URL.createObjectURL(file));
            } else {
                setVideoThumbnails(prev => ({ ...prev, [dropKey]: file }));
                updateDrop(dropType, dropIndex, field, URL.createObjectURL(file));
            }
        }
    };

    /* SUBMIT WITH FORM DATA */
    const handleSubmit = async () => {
        if (isSubmitting) return;

        if (!form.team360PostId) {
            alert("Please select a Team");
            return;
        }

        const allDrops = [...form.audioDrops, ...form.videoDrops];
        for (const drop of allDrops) {
            if (!drop.title) {
                alert("All drops must have a title");
                return;
            }
        }

        const formData = new FormData();
        formData.append("team360PostId", form.team360PostId);

        // Add audio drops
        form.audioDrops.forEach((drop, index) => {
            const dropKey = `audioDrops-${index}`;
            const audioFile = audioFiles[dropKey];
            const thumbnailFile = audioThumbnails[dropKey];

            if (audioFile) {
                formData.append("audioFiles", audioFile);
                formData.append("audioTitles", drop.title);
                formData.append("audioDescriptions", drop.description || "");
                formData.append("audioListens", drop.listens?.toString() || "0");
                formData.append("audioSignals", drop.signals?.toString() || "0");
                formData.append("audioEngagement", drop.engagement?.toString() || "0");

                if (thumbnailFile) {
                    formData.append("audioThumbnails", thumbnailFile);
                }
            }
        });

        // Add video drops
        form.videoDrops.forEach((drop, index) => {
            const dropKey = `videoDrops-${index}`;
            const videoFile = videoFiles[dropKey];
            const thumbnailFile = videoThumbnails[dropKey];

            if (videoFile) {
                formData.append("videoFiles", videoFile);
                formData.append("videoTitles", drop.title);
                formData.append("videoDescriptions", drop.description || "");
                formData.append("videoListens", drop.listens?.toString() || "0");
                formData.append("videoSignals", drop.signals?.toString() || "0");
                formData.append("videoEngagement", drop.engagement?.toString() || "0");

                if (thumbnailFile) {
                    formData.append("videoThumbnails", thumbnailFile);
                }
            }
        });

        if (!hasNewFiles && !hasExistingDrops) {
            alert("Please add at least one audio or video file");
            return;
        }

        // Add existing drops as JSON so PUT API knows what to keep
        formData.append("existingAudioDrops", JSON.stringify(
            form.audioDrops.filter((_, index) => !audioFiles[`audioDrops-${index}`])
        ));
        formData.append("existingVideoDrops", JSON.stringify(
            form.videoDrops.filter((_, index) => !videoFiles[`videoDrops-${index}`])
        ));

        try {
            setIsSubmitting(true);
            setSubmitNotice(
                playlistIdToEdit
                    ? "Updating playlist, please wait..."
                    : "Creating playlist, please wait..."
            );

            const response = await fetch(
                playlistIdToEdit
                    ? `/api/team360-playlist/${playlistIdToEdit}`
                    : "/api/team360-playlist",
                {
                    method: playlistIdToEdit ? "PUT" : "POST",
                    body: formData,
                }
            );

            const result = await response.json();

            if (result.success) {
                alert(playlistIdToEdit ? "Playlist updated successfully!" : "Playlist created successfully!");
                router.push("/admin/team360playlist-management/team360playlist-list");
            } else {
                setSubmitNotice(null);
                alert(`Failed to ${playlistIdToEdit ? "update" : "create"} playlist: ${result.message}`);
            }
        } catch (error) {
            setSubmitNotice(null);
            console.error("Submit error:", error);
            alert(`Failed to ${playlistIdToEdit ? "update" : "create"} playlist`);
        } finally {
            setIsSubmitting(false);
        }
    };

    /* RENDER DROP SECTION */
    const renderDropSection = (
        type: "audioDrops" | "videoDrops",
        label: string,
        mediaType: "audio" | "video"
    ) => (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">{label}</h2>

            {form[type].map((drop, index) => {
                const dropKey = `${type}-${index}`;
                const hasMediaFile = type === "audioDrops" ? audioFiles[dropKey] : videoFiles[dropKey];
                const hasThumbnail = type === "audioDrops" ? audioThumbnails[dropKey] : videoThumbnails[dropKey];

                return (
                    <div
                        key={index}
                        className="space-y-3 bg-[#0d1117] p-4 rounded border border-gray-700"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Title *</label>
                                <input
                                    placeholder="Enter title"
                                    value={drop.title}
                                    onChange={(e) =>
                                        updateDrop(type, index, "title", e.target.value)
                                    }
                                    className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Description</label>
                                <textarea
                                    placeholder="Enter description"
                                    value={drop.description || ""}
                                    onChange={(e) =>
                                        updateDrop(type, index, "description", e.target.value)
                                    }
                                    rows={2}
                                    className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-white"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">
                                    {mediaType === "audio" ? "Audio File *" : "Video File *"}
                                </label>
                                <input
                                    type="file"
                                    accept={mediaType === "audio" ? "audio/*" : "video/*"}
                                    onChange={(e) => handleFileSelect(e, type, index, "mediaUrl")}
                                    className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-white file:mr-2 file:py-1 file:px-3 file:rounded file:bg-blue-600 file:text-white file:border-0"
                                />
                                {hasMediaFile && (
                                    <p className="text-xs text-green-500 mt-1 truncate">
                                        ✓ {hasMediaFile.name}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Thumbnail (Optional)</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleFileSelect(e, type, index, "thumbnail")}
                                    className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-white file:mr-2 file:py-1 file:px-3 file:rounded file:bg-blue-600 file:text-white file:border-0"
                                />
                                {hasThumbnail && (
                                    <p className="text-xs text-green-500 mt-1 truncate">
                                        ✓ {hasThumbnail.name}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Listens</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={drop.listens || 0}
                                        onChange={(e) =>
                                            updateDrop(type, index, "listens", e.target.value)
                                        }
                                        className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Signals</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={drop.signals || 0}
                                        onChange={(e) =>
                                            updateDrop(type, index, "signals", e.target.value)
                                        }
                                        className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Engagement</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={drop.engagement || 0}
                                        onChange={(e) =>
                                            updateDrop(type, index, "engagement", e.target.value)
                                        }
                                        className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-white"
                                    />
                                </div>
                            </div>
                        </div>

                        {drop.mediaUrl && (
                            <div className="mt-2 p-2 bg-[#161b22] rounded">
                                {mediaType === "audio" ? (
                                    <audio controls className="w-full">
                                        <source src={drop.mediaUrl} />
                                    </audio>
                                ) : (
                                    <video controls className="w-full max-h-48">
                                        <source src={drop.mediaUrl} />
                                    </video>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => removeDrop(type, index)}
                                className="px-4 py-2 bg-red-600 rounded text-white hover:bg-red-700"
                            >
                                Remove {mediaType === "audio" ? "Audio" : "Video"} Drop
                            </button>
                        </div>
                    </div>
                );
            })}

            <button
                onClick={() => addDrop(type)}
                className="bg-blue-600 px-4 py-2 rounded text-white hover:bg-blue-700"
            >
              Add {label}
            </button>
        </div>
    );

    return (
        <div className="w-full mx-auto p-2">
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-8">
                <h1 className="text-xl font-semibold text-white">
                    {playlistIdToEdit
                        ? "Update Full Playlist"
                        : "Create Full Playlist"}
                </h1>

                {/* Team Selection Dropdown */}
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Select Team *</label>
                    <select
                        value={form.team360PostId}
                        onChange={(e) => handleTeamSelect(e.target.value)}
                        className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-white focus:outline-none focus:border-blue-500"
                        disabled={fetchingPosts}
                    >
                        <option value="">-- Select a Team --</option>
                        {team360Posts.map((post) => (
                            <option key={post.id} value={post.id}>
                                {post.teamName}
                            </option>
                        ))}
                    </select>
                    {form.teamName && (
                        <p className="text-xs text-green-500 mt-1">
                            Selected: {form.teamName}
                        </p>
                    )}
                </div>

                {renderDropSection("audioDrops", "Audio Drops", "audio")}
                {renderDropSection("videoDrops", "Video Drops", "video")}

                {submitNotice && (
                    <div className="rounded border border-blue-700 bg-blue-900/20 px-4 py-3 text-sm text-blue-300">
                        {submitNotice}
                    </div>
                )}

                <button
                    onClick={handleSubmit}
                    disabled={loading || isSubmitting}
                    className="w-full bg-blue-600 py-3 rounded font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading || isSubmitting
                        ? (playlistIdToEdit ? "Updating..." : "Creating...")
                        : playlistIdToEdit
                            ? "Update Playlist"
                            : "Create Playlist"}
                </button>
            </div>
        </div>
    );
}