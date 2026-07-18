"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ClubProfileForm, { defaultProfileForm } from "./ClubProfileForm";
import SeasonStatsForm, { defaultSeasonForm } from "./SeasonStatsForm";
import InsightsForm from "./InsightsForm";
import MediaForm from "./MediaForm";

import type {
  Tab,
  ProfileForm,
  SeasonForm,
  Insight,
  MediaItem,
} from "./shared";



//  PROPS 

type Props = {
  profileIdToEdit?: string;
};

//  TAB CONFIG 
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "profile",  label: "Club Profile",  icon: "🏏" },
  { key: "season",   label: "Season Stats",  icon: "📊" },
  { key: "insights", label: "Insights",      icon: "💡" },
  { key: "media",    label: "Media",         icon: "🎬" },
];

//  PAGE COMPONENT 

export default function CreateClubProfile({ profileIdToEdit }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // IDs — set after each section is saved
  const [savedProfileId,  setSavedProfileId]  = useState(profileIdToEdit || "");
  const [savedSeasonId,   setSavedSeasonId]   = useState("");
  const [savedInsightsId, setSavedInsightsId] = useState("");
  const [savedMediaId,    setSavedMediaId]    = useState("");

  // Initial data for each form (populated on edit)
  const [profileInitial,  setProfileInitial]  = useState<ProfileForm>(defaultProfileForm);
  const [avatarInitial,   setAvatarInitial]   = useState("");
  const [seasonInitial,   setSeasonInitial]   = useState<SeasonForm>(defaultSeasonForm);
  const [insightsInitial, setInsightsInitial] = useState<Insight[]>([]);
  const [strengthsInitial,setStrengthsInitial]= useState<string[]>([]);
  const [mediaInitial,    setMediaInitial]    = useState<MediaItem[]>([]);

  //  Fetch all data when editing 
  useEffect(() => {
    if (!profileIdToEdit) return;

    const fetchAll = async () => {
      try {
        // 1. Profile
        const profileRes = await axios.get(`/api/club-profile/${profileIdToEdit}`);
        const p = profileRes.data.profile;
        setProfileInitial({
          name:            p.name            || "",
          team:            p.team            || "",
          battingStyle:    p.battingStyle    || "",
          bowlingStyle:    p.bowlingStyle    || "",
          about:           p.about           || "",
          statsRuns:       p.stats?.runs     || "",
          statsSr:         p.stats?.sr       || "",
          statsAvg:        p.stats?.avg      || "",
          overviewCaptain: p.overview?.captain || "",
          overviewCoach:   p.overview?.coach   || "",
          overviewOwner:   p.overview?.owner   || "",
          overviewVenue:   p.overview?.venue   || "",
        });
        setAvatarInitial(p.avatar || "");

        // 2. Season (latest)
        const seasonRes = await axios.get(
          `/api/club-profile/season?clubProfileId=${profileIdToEdit}&limit=1`
        );
        if (seasonRes.data.seasons?.length > 0) {
          const s = seasonRes.data.seasons[0];
          setSavedSeasonId(s.id);
          const sd = s.season;
          setSeasonInitial({
            year:         sd.year         || "",
            wins:         sd.wins         || "",
            losses:       sd.losses       || "",
            points:       sd.points       || "",
            position:     sd.position     || "",
            matchesPlayed:sd.matchesPlayed|| "",
            netRunRate:   sd.netRunRate   || "",
            highestTotal: sd.highestTotal || "",
            lowestTotal:  sd.lowestTotal  || "",
            runs:         sd.runs         || "",
            strikeRate:   sd.strikeRate   || "",
            average:      sd.average      || "",
            fifties:      String(sd.fifties  ?? ""),
            hundreds:     String(sd.hundreds ?? ""),
            highestScore: sd.highestScore || "",
            fours:        String(sd.fours ?? ""),
            sixes:        String(sd.sixes ?? ""),
            award:        sd.award        || "",
            awardSub:     sd.awardSub     || "",
          });
        }

        // 3. Insights
        const insightsRes = await axios.get(
          `/api/club-profile/insights?clubProfileId=${profileIdToEdit}&limit=1`
        );
        if (insightsRes.data.insightsDocs?.length > 0) {
          const ins = insightsRes.data.insightsDocs[0];
          setSavedInsightsId(ins.id);
          setInsightsInitial(ins.insights  || []);
          setStrengthsInitial(ins.strengths || []);
        }

        // 4. Media
        const mediaRes = await axios.get(
          `/api/club-profile/media?clubProfileId=${profileIdToEdit}&limit=1`
        );
        if (mediaRes.data.mediaDocs?.length > 0) {
          const med = mediaRes.data.mediaDocs[0];
          setSavedMediaId(med.id);
          setMediaInitial(
            (med.mediaItems || []).map(
              (m: { title: string; views: string; time: string; thumbnail: string }) => ({
                title:             m.title     || "",
                views:             m.views     || "",
                time:              m.time      || "",
                file:              null,
                existingThumbnail: m.thumbnail || "",
              })
            )
          );
        }
      } catch (err) {
        console.error("Fetch error on edit:", err);
      }
    };

    fetchAll();
  }, [profileIdToEdit]);

  // ── Tab guard: prevent navigating forward before profile is saved ─────────
  const handleTabClick = (key: Tab) => {
    if (key !== "profile" && !savedProfileId) {
      alert("Please save the Club Profile first");
      return;
    }
    setActiveTab(key);
  };

  // ── Completion 
  const handleFinish = () => {
    router.push("/admin/clubprofile-management/clubprofile-list");
  };

  // ─── RENDER 
  return (
    <div className="max-w-[1440px] mx-auto p-6">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">
            {profileIdToEdit ? "Edit Club Profile" : "Create Club Profile"}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Fill each tab and save before moving to the next
          </p>
        </div>
        {savedProfileId && (
          <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-3 py-1 rounded-full">
            Profile ID: {savedProfileId.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-[#0d1117] p-1 rounded-lg border border-[#21262d] w-fit">
        {TABS.map((t) => {
          const isLocked = t.key !== "profile" && !savedProfileId;
          return (
            <button
              key={t.key}
              onClick={() => handleTabClick(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                ${activeTab === t.key
                  ? "bg-blue-600 text-white shadow-lg"
                  : isLocked
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-white hover:bg-[#161b22]"
                }`}
            >
              <span>{t.icon}</span>
              {t.label}
              {isLocked && (
                <span className="text-gray-700 text-xs ml-1">🔒</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Club Profile ── */}
      {activeTab === "profile" && (
        <ClubProfileForm
          profileIdToEdit={profileIdToEdit}
          initialForm={profileInitial}
          initialAvatar={avatarInitial}
          onSaved={(id) => {
            setSavedProfileId(id);
            setActiveTab("season");
          }}
          onCancel={() => router.back()}
        />
      )}

      {/* ── Tab: Season Stats ── */}
      {activeTab === "season" && (
        <SeasonStatsForm
          clubProfileId={savedProfileId}
          seasonDocId={savedSeasonId}
          initialForm={seasonInitial}
          onSaved={(id) => {
            setSavedSeasonId(id);
            setActiveTab("insights");
          }}
          onBack={() => setActiveTab("profile")}
        />
      )}

      {/* ── Tab: Insights ── */}
      {activeTab === "insights" && (
        <InsightsForm
          clubProfileId={savedProfileId}
          insightsDocId={savedInsightsId}
          initialInsights={insightsInitial}
          initialStrengths={strengthsInitial}
          onSaved={(id) => {
            setSavedInsightsId(id);
            setActiveTab("media");
          }}
          onBack={() => setActiveTab("season")}
        />
      )}

      {/* ── Tab: Media ── */}
      {activeTab === "media" && (
        <MediaForm
          clubProfileId={savedProfileId}
          mediaDocId={savedMediaId}
          initialItems={mediaInitial}
          onSaved={setSavedMediaId}
          onBack={() => setActiveTab("insights")}
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}