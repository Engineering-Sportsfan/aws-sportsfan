"use client";

import axios from "axios";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Search,
  Mic2,
  Clock,
  HardDrive,
  Calendar,
  ChevronRight,
  Volume2,
  Trash2,
} from "lucide-react";

type MatchInfo = {
  team1?: string;
  team2?: string;
  type?: string;
  speaker?: string;
  date?: string;
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
  matchInfo?: MatchInfo;
};

const TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "pre match": {
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    dot: "bg-sky-400",
  },
  "post match": {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  "fan post match": {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    dot: "bg-purple-400",
  },
  highlights: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  mid: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    dot: "bg-orange-400",
  },
};

function getTypeStyle(type?: string) {
  if (!type) return TYPE_COLORS["post match"];
  const key = type.toLowerCase();
  return (
    TYPE_COLORS[key] || {
      bg: "bg-gray-500/10",
      text: "text-gray-400",
      dot: "bg-gray-400",
    }
  );
}

function TeamBadge({ team }: { team?: string }) {
  if (!team) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-[#21262d] text-gray-200 border border-[#30363d]">
      {team}
    </span>
  );
}

export default function AudioListPage() {
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  const [realDurations, setRealDurations] = useState<Record<string, string>>({});
  const requestedDurations = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchAudio();
  }, []);

  useEffect(() => {
    audioFiles.forEach((audio) => {
      if ((!audio.duration || audio.duration === "0:00") && !requestedDurations.current.has(audio.id)) {
        requestedDurations.current.add(audio.id);
        const tempAudio = new Audio(audio.url);
        tempAudio.addEventListener("loadedmetadata", () => {
          const secs = tempAudio.duration;
          if (secs && !isNaN(secs) && secs !== Infinity) {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            setRealDurations((prev) => ({
              ...prev,
              [audio.id]: `${m}:${s.toString().padStart(2, "0")}`,
            }));
          }
        });
      }
    });
  }, [audioFiles]);

  const fetchAudio = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `http://localhost:3001/api/cloudinary/audio${search ? `?search=${search}` : ""}`
      );
      setAudioFiles(res.data.audioFiles || []);
    } catch (err) {
      console.error("Failed to fetch audio", err);
      setAudioFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (audio: AudioFile) => {
    if (!window.confirm("Are you sure you want to delete this audio file?")) return;
    try {
      await axios.delete(`/api/cloudinary/audio/${encodeURIComponent(audio.id)}`);
      setAudioFiles((prev) => prev.filter((a) => a.id !== audio.id));
      if (playingId === audio.id) {
        audioRefs.current[audio.id]?.pause();
        setPlayingId(null);
      }
    } catch (err) {
      console.error("Failed to delete audio", err);
      alert("Failed to delete audio file");
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAudio();
  };

  const togglePlay = (audio: AudioFile) => {
    const existing = audioRefs.current[audio.id];

    if (playingId === audio.id) {
      existing?.pause();
      setPlayingId(null);
      return;
    }

    // Pause any currently playing
    if (playingId && audioRefs.current[playingId]) {
      audioRefs.current[playingId].pause();
    }

    if (!existing) {
      const el = new Audio(audio.url);
      audioRefs.current[audio.id] = el;

      el.addEventListener("timeupdate", () => {
        if (el.duration) {
          setProgress((prev) => ({
            ...prev,
            [audio.id]: (el.currentTime / el.duration) * 100,
          }));
        }
      });

      el.addEventListener("ended", () => {
        setPlayingId(null);
        setProgress((prev) => ({ ...prev, [audio.id]: 0 }));
      });

      el.play();
    } else {
      existing.play();
    }

    setPlayingId(audio.id);
  };

  const filtered = audioFiles.filter((a) => {
    const q = search.toLowerCase();
    return (
      !q ||
      a.title.toLowerCase().includes(q) ||
      a.matchInfo?.team1?.toLowerCase().includes(q) ||
      a.matchInfo?.team2?.toLowerCase().includes(q) ||
      a.matchInfo?.speaker?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Volume2 size={20} className="text-blue-400" />
            Audio Files
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {audioFiles.length} recordings across all matches
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team, speaker..."
              className="pl-8 pr-4 py-2 text-sm bg-[#161b22] border border-[#21262d] rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-60"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 transition rounded-lg"
          >
            Search
          </button>
        </form>
      </div>

      {/* TABLE */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {[
                  "#",
                  "Match",
                  "Type",
                  "Speaker",
                  "Duration",
                  "Size",
                  "Uploaded",
                  "Play",
                  "Actions",
                ].map((head) => (
                  <th
                    key={head}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading audio files...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500">
                    <Mic2 size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No audio files found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((audio, index) => {
                  const isPlaying = playingId === audio.id;
                  const prog = progress[audio.id] || 0;
                  const typeStyle = getTypeStyle(audio.matchInfo?.type);

                  return (
                    <tr
                      key={audio.id}
                      className={`border-b border-[#21262d] transition ${
                        isPlaying
                          ? "bg-blue-500/5"
                          : "hover:bg-[#0d1117]"
                      }`}
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-gray-500 text-sm w-10">
                        {index + 1}
                      </td>

                      {/* Match */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TeamBadge team={audio.matchInfo?.team1} />
                          <ChevronRight size={12} className="text-gray-600" />
                          <TeamBadge team={audio.matchInfo?.team2} />
                        </div>
                        {audio.matchInfo?.date && (
                          <p className="text-[11px] text-gray-500 mt-1">
                            {audio.matchInfo.date.slice(0, 2)}/
                            {audio.matchInfo.date.slice(2, 4)}/
                            {audio.matchInfo.date.slice(4)}
                          </p>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium capitalize ${typeStyle.bg} ${typeStyle.text}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${typeStyle.dot}`}
                          />
                          {audio.matchInfo?.type || "—"}
                        </span>
                      </td>

                      {/* Speaker */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[10px] font-semibold text-gray-300 uppercase">
                            {audio.matchInfo?.speaker
                              ?.split(" ")
                              .map((w) => w[0])
                              .slice(0, 2)
                              .join("") || "?"}
                          </div>
                          <span className="text-sm text-gray-300 capitalize">
                            {audio.matchInfo?.speaker !== "unknown"
                              ? audio.matchInfo?.speaker
                              : "—"}
                          </span>
                        </div>
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-400 text-sm">
                          <Clock size={12} />
                          {realDurations[audio.id] || audio.duration || "0:00"}
                        </div>
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-400 text-sm">
                          <HardDrive size={12} />
                          {audio.sizeFormatted}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                          <Calendar size={11} />
                          {audio.createdAtFormatted}
                        </div>
                      </td>

                      {/* Play */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => togglePlay(audio)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                              isPlaying
                                ? "bg-blue-500 text-white hover:bg-blue-600"
                                : "bg-[#21262d] text-gray-300 hover:bg-[#30363d]"
                            }`}
                          >
                            {isPlaying ? (
                              <Pause size={14} />
                            ) : (
                              <Play size={14} className="translate-x-px" />
                            )}
                          </button>

                          {/* Progress bar */}
                          {isPlaying && (
                            <div className="w-8 h-0.5 bg-[#21262d] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 transition-all"
                                style={{ width: `${prog}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(audio)}
                          className="w-8 h-8 rounded-full flex items-center justify-center transition bg-[#21262d] text-red-400 hover:bg-red-500/10 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 bg-[#1c2330] border-t border-[#21262d] flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Showing {filtered.length} of {audioFiles.length} files
            </span>
            <span className="text-xs text-gray-500">
              {filtered
                .reduce((acc, a) => acc + a.size, 0)
                .toLocaleString()}{" "}
              bytes total
            </span>
          </div>
        )}
      </div>
    </div>
  );
}