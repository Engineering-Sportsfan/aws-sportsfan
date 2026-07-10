"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import {
    ArrowLeft,
    Trophy,
    MapPin,
    Users,
    TrendingUp,
    Star,
    Shield,
    Calendar,
    Pencil,
    Play,
    Eye,
    Award,
    Target,
    Zap,
    BarChart2,
    CheckCircle,
    Lightbulb,
} from "lucide-react";
import Link from "next/link";

// ─── TYPES ─────────────────────────────────────────────────────────────────────

type Stats = { runs: string; sr: string; avg: string };
type Overview = { captain: string; coach: string; owner: string; venue: string };

type PlayerProfile = {
    id: string;
    name: string;
    team: string;
    battingStyle: string;
    bowlingStyle: string;
    about: string;
    avatar: string;
    stats: Stats;
    overview: Overview;
    createdAt: number;
    updatedAt: number;
};

type SeasonData = {
    year: string; wins: string; losses: string; points: string; position: string;
    matchesPlayed: string; netRunRate: string; highestTotal: string; lowestTotal: string;
    runs: string; strikeRate: string; average: string;
    fifties: number; hundreds: number; highestScore: string; fours: number; sixes: number;
    award: string; awardSub: string;
    wickets: number; deliveries: number; bowlingAvg: string; bowlingSR: string; economy: string;
    bestBowling: string; threeWicketHauls: number; fiveWicketHauls: number;
    foursConceded: number; sixesConceded: number;
};

type SeasonDoc = { id: string; playerProfileId: string; season: SeasonData };

type Insight = { title: string; description: string };
type InsightsDoc = { id: string; insights: Insight[]; strengths: string[] };

type MediaItemRaw = { title: string; views: string; time: string; thumbnail: string };
type MediaDoc = { id: string; mediaItems: MediaItemRaw[] };

type ViewTab = "overview" | "season" | "insights" | "media";

// ─── COMPONENT ─────────────────────────────────────────────────────────────────

export default function PlayerProfileViewPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [profile, setProfile] = useState<PlayerProfile | null>(null);
    const [seasonDoc, setSeasonDoc] = useState<SeasonDoc | null>(null);
    const [insightsDoc, setInsightsDoc] = useState<InsightsDoc | null>(null);
    const [mediaDoc, setMediaDoc] = useState<MediaDoc | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ViewTab>("overview");

    useEffect(() => {
        if (id) fetchAll();
    }, [id]);

    const fetchAll = async () => {
        try {
            setLoading(true);
            setError(null);

            const [profileRes, seasonRes, insightsRes, mediaRes] = await Promise.all([
                axios.get(`/api/player-profile/${id}`),
                axios.get(`/api/player-profile/seasonstats?playerProfileId=${id}&limit=1`),
                axios.get(`/api/player-profile/insights/${id}`),
                axios.get(`/api/player-profile/media?playerProfileId=${id}&limit=1`),
            ]);

            if (!profileRes.data.success) { setError("Player profile not found"); return; }
            setProfile(profileRes.data.profile);
            if (seasonRes.data.seasons?.length > 0) setSeasonDoc(seasonRes.data.seasons[0]);
            if (insightsRes.data.success && insightsRes.data.insightsDoc) {
                setInsightsDoc(insightsRes.data.insightsDoc);
            }
            console.log(insightsRes.data.insightsDoc);
            if (mediaRes.data.mediaDocs?.length > 0) setMediaDoc(mediaRes.data.mediaDocs[0]);
        } catch (err) {
            console.error("Fetch error:", err);
            setError("Failed to load player profile");
        } finally {
            setLoading(false);
        }
    };

    const getTimeAgo = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor(diff / 60000);
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        return `${minutes}m ago`;
    };

    const TABS: { key: ViewTab; label: string; icon: React.ReactNode }[] = [
        { key: "overview", label: "Overview", icon: <Shield size={15} /> },
        { key: "season", label: "Season", icon: <BarChart2 size={15} /> },
        { key: "insights", label: "Insights", icon: <Lightbulb size={15} /> },
        { key: "media", label: "Media", icon: <Play size={15} /> },
    ];

    // ── Loading ──
    if (loading) {
        return (
            <div className="max-w-[1440px] mx-auto p-6">
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-16 flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                    <p className="text-gray-500 text-sm">Loading player profile...</p>
                </div>
            </div>
        );
    }

    // ── Error ──
    if (error || !profile) {
        return (
            <div className="max-w-[1440px] mx-auto p-6">
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-16 text-center">
                    <p className="text-red-400 mb-4">{error || "Profile not found"}</p>
                    <button onClick={() => router.back()} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const season = seasonDoc?.season;

    return (
        <div className="max-w-[1440px] mx-auto p-6">

            {/* ── Back ── */}
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-5 transition text-sm"
            >
                <ArrowLeft size={18} /> Back to Profiles
            </button>

            {/* ── Hero Card ── */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 mb-6">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6">

                    {/* Avatar */}
                    <div className="relative shrink-0">
                        {profile.avatar ? (
                            <img
                                src={profile.avatar}
                                alt={profile.name}
                                className="w-24 h-24 rounded-full object-cover border-2 border-[#30363d]"
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-full bg-[#21262d] flex items-center justify-center">
                                <Trophy size={36} className="text-gray-600" />
                            </div>
                        )}
                        <span className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {profile.team}
                        </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
                                <div className="flex flex-wrap items-center gap-3 mt-1">
                                    {profile.battingStyle && (
                                        <span className="text-xs text-gray-400 bg-[#0d1117] px-2 py-1 rounded border border-[#30363d]">
                                            {profile.battingStyle}
                                        </span>
                                    )}
                                    {profile.bowlingStyle && (
                                        <span className="text-xs text-gray-400">{profile.bowlingStyle}</span>
                                    )}
                                    <span className="text-xs text-gray-600 flex items-center gap-1">
                                        <Calendar size={11} /> Created {getTimeAgo(profile.createdAt)}
                                    </span>
                                </div>
                            </div>

                            <Link href={`/admin/playerprofile-management/add-playerprofile?id=${profile.id}`}>
                                <button className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm transition">
                                    <Pencil size={14} /> Edit Profile
                                </button>
                            </Link>
                        </div>

                        {profile.about && (
                            <p className="mt-3 text-sm text-gray-400 leading-relaxed max-w-3xl">
                                {profile.about}
                            </p>
                        )}
                    </div>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6 pt-5 border-t border-[#21262d]">
                    <StatCard label="Runs" value={profile.stats?.runs} icon={<TrendingUp size={14} />} accent="blue" />
                    <StatCard label="Strike Rate" value={profile.stats?.sr} icon={<Zap size={14} />} accent="green" />
                    <StatCard label="Average" value={profile.stats?.avg} icon={<Target size={14} />} accent="yellow" />
                    <StatCard label="Captain" value={profile.overview?.captain} icon={<Star size={14} />} accent="purple" />
                    <StatCard label="Coach" value={profile.overview?.coach} icon={<Users size={14} />} accent="gray" />
                    <StatCard label="Venue" value={profile.overview?.venue} icon={<MapPin size={14} />} accent="gray" truncate />
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 mb-5 bg-[#0d1117] p-1 rounded-lg border border-[#21262d] w-fit">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === t.key
                                ? "bg-blue-600 text-white shadow"
                                : "text-gray-400 hover:text-white hover:bg-[#161b22]"
                            }`}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* ── TAB: OVERVIEW ── */}
            {activeTab === "overview" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Overview card */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                        <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                            <Shield size={15} className="text-blue-400" /> Club Overview
                        </h2>
                        <div className="space-y-3">
                            <OverviewRow label="Captain" value={profile.overview?.captain} />
                            <OverviewRow label="Head Coach" value={profile.overview?.coach} />
                            <OverviewRow label="Owner / Sponsor" value={profile.overview?.owner} />
                            <OverviewRow label="Home Venue" value={profile.overview?.venue} />
                            <OverviewRow label="Team Code" value={profile.team} />
                            <OverviewRow label="Type" value={profile.battingStyle} />
                            <OverviewRow label="Founded" value={profile.bowlingStyle} />
                        </div>
                    </div>

                    {/* Stats card */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                        <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                            <BarChart2 size={15} className="text-green-400" /> Career Stats
                        </h2>
                        <div className="space-y-3">
                            <BigStatRow label="Total Runs" value={profile.stats?.runs} />
                            <BigStatRow label="Strike Rate" value={profile.stats?.sr} />
                            <BigStatRow label="Batting Average" value={profile.stats?.avg} />
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: SEASON ── */}
            {activeTab === "season" && (
                <div className="space-y-5">
                    {!season ? (
                        <EmptySection
                            message="No season data available yet."
                            linkHref={`/admin/player-profile-management/add-player-profile?id=${profile.id}`}
                            linkLabel="Add Season Data"
                        />
                    ) : (
                        <>
                            {/* Season banner */}
                            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                                <div className="flex items-center justify-between mb-5">
                                    <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                                        <Trophy size={15} className="text-yellow-400" /> IPL {season.year} Season
                                    </h2>
                                    {season.award && (
                                        <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-800/40 text-yellow-400 px-3 py-1.5 rounded-lg text-xs font-medium">
                                            <Award size={13} /> {season.award}
                                        </div>
                                    )}
                                </div>

                                {/* League table stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                                    <SeasonCell label="Matches" value={season.matchesPlayed} />
                                    <SeasonCell label="Wins" value={season.wins} accent="green" />
                                    <SeasonCell label="Losses" value={season.losses} accent="red" />
                                    <SeasonCell label="Points" value={season.points} accent="blue" />
                                    <SeasonCell label="Position" value={season.position} accent="yellow" />
                                    <SeasonCell label="NRR" value={season.netRunRate} />
                                    <SeasonCell label="Highest" value={season.highestTotal} />
                                </div>
                            </div>

                            {/* Batting performance */}
                            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                                <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                                    <TrendingUp size={15} className="text-blue-400" /> Batting Performance
                                </h2>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <SeasonCell label="Runs" value={season.runs} accent="blue" />
                                    <SeasonCell label="Strike Rate" value={season.strikeRate} accent="green" />
                                    <SeasonCell label="Average" value={season.average} accent="yellow" />
                                    <SeasonCell label="Highest Score" value={season.highestScore} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                                    <SeasonCell label="50s" value={String(season.fifties)} />
                                    <SeasonCell label="100s" value={String(season.hundreds)} accent="purple" />
                                    <SeasonCell label="Fours" value={String(season.fours)} />
                                    <SeasonCell label="Sixes" value={String(season.sixes)} accent="red" />
                                </div>
                            </div>

                            {/* Award sub */}
                            {season.awardSub && (
                                <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-4 flex items-center gap-3">
                                    <Award size={20} className="text-yellow-400 shrink-0" />
                                    <div>
                                        <p className="text-yellow-300 text-sm font-medium">{season.award}</p>
                                        <p className="text-yellow-500 text-xs mt-0.5">{season.awardSub}</p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── TAB: INSIGHTS ── */}
            {activeTab === "insights" && (
                <div className="space-y-5">
                    {!insightsDoc ? (
                        <EmptySection
                            message="No insights available yet."
                            linkHref={`/admin/player-profile-management/add-player-profile?id=${profile.id}`}
                            linkLabel="Add Insights"
                        />
                    ) : (
                        <>
                            {/* Insights */}
                            {insightsDoc.insights?.length > 0 && (
                                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                                    <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                                        <Lightbulb size={15} className="text-yellow-400" /> Insights ({insightsDoc.insights.length})
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {insightsDoc.insights.map((ins, i) => (
                                            <div key={i} className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
                                                <p className="text-white text-sm font-medium mb-2">{ins.title}</p>
                                                <p className="text-gray-400 text-sm leading-relaxed">{ins.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Strengths */}
                            {insightsDoc.strengths?.length > 0 && (
                                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                                    <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                                        <CheckCircle size={15} className="text-green-400" /> Strengths ({insightsDoc.strengths.length})
                                    </h2>
                                    <ul className="space-y-2">
                                        {insightsDoc.strengths.map((s, i) => (
                                            <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                                                <CheckCircle size={15} className="text-green-500 mt-0.5 shrink-0" />
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── TAB: MEDIA ── */}
            {activeTab === "media" && (
                <div>
                    {!mediaDoc || mediaDoc.mediaItems?.length === 0 ? (
                        <EmptySection
                            message="No media items available yet."
                            linkHref={`/admin/player-profile-management/add-player-profile?id=${profile.id}`}
                            linkLabel="Add Media"
                        />
                    ) : (
                        <div>
                            <p className="text-sm text-gray-500 mb-4">
                                {mediaDoc.mediaItems.length} media item{mediaDoc.mediaItems.length !== 1 ? "s" : ""}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {mediaDoc.mediaItems.map((m, i) => (
                                    <div
                                        key={i}
                                        className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden hover:border-gray-600 transition group"
                                    >
                                        {/* Thumbnail */}
                                        <div className="relative aspect-video bg-[#0d1117] overflow-hidden">
                                            {m.thumbnail ? (
                                                <img
                                                    src={m.thumbnail}
                                                    alt={m.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Play size={32} className="text-gray-700" />
                                                </div>
                                            )}
                                            {/* Overlay play icon */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                                    <Play size={16} className="text-white ml-0.5" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="p-3">
                                            <p className="text-white text-sm font-medium leading-tight mb-2 line-clamp-2">
                                                {m.title}
                                            </p>
                                            <div className="flex items-center justify-between text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Eye size={11} /> {m.views}
                                                </span>
                                                <span>{m.time}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── SUBCOMPONENTS 

type AccentColor = "blue" | "green" | "yellow" | "red" | "purple" | "gray";

const accentMap: Record<AccentColor, string> = {
    blue: "text-blue-400",
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    purple: "text-purple-400",
    gray: "text-gray-300",
};

function StatCard({
    label, value, icon, accent = "gray", truncate,
}: {
    label: string; value?: string; icon: React.ReactNode; accent?: AccentColor; truncate?: boolean;
}) {
    return (
        <div className="bg-[#0d1117] rounded-lg p-3 border border-[#21262d]">
            <div className={`flex items-center gap-1 mb-1 ${accentMap[accent]}`}>{icon}</div>
            <p className={`text-sm font-semibold ${accentMap[accent]} ${truncate ? "truncate" : ""}`}>
                {value || "—"}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{label}</p>
        </div>
    );
}

function OverviewRow({ label, value }: { label: string; value?: string }) {
    if (!value) return null;
    return (
        <div className="flex items-start justify-between py-2 border-b border-[#21262d] last:border-0">
            <span className="text-xs text-gray-500">{label}</span>
            <span className="text-sm text-gray-200 text-right max-w-[60%]">{value}</span>
        </div>
    );
}

function BigStatRow({ label, value }: { label: string; value?: string }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-[#21262d] last:border-0">
            <span className="text-sm text-gray-400">{label}</span>
            <span className="text-2xl font-bold text-white font-mono">{value || "—"}</span>
        </div>
    );
}

function SeasonCell({
    label, value, accent = "gray",
}: {
    label: string; value?: string; accent?: AccentColor;
}) {
    return (
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3 text-center">
            <p className={`text-lg font-bold font-mono ${accentMap[accent]}`}>{value || "—"}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        </div>
    );
}

function EmptySection({
    message, linkHref, linkLabel,
}: {
    message: string; linkHref: string; linkLabel: string;
}) {
    return (
        <div className="bg-[#161b22] border border-dashed border-[#30363d] rounded-lg p-12 text-center">
            <p className="text-gray-500 text-sm mb-4">{message}</p>
            <Link href={linkHref}>
                <button className="text-blue-400 hover:text-blue-300 text-sm bg-[#0d1117] border border-[#21262d] hover:border-blue-800 px-4 py-2 rounded transition">
                    {linkLabel}
                </button>
            </Link>
        </div>
    );
}