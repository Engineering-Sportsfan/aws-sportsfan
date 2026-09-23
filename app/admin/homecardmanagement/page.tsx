"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { 
  Sun, 
  Calendar, 
  Sparkles, 
  Plus, 
  List, 
  Radio, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Activity,
  Layers,
  Save,
  Loader2
} from "lucide-react";

export default function HomeCardManagementDashboard() {
  const [data, setData] = useState<{
    morningBrief: any[];
    todaysAgenda: any[];
    radarCards: any[];
    config: any;
  }>({
    morningBrief: [],
    todaysAgenda: [],
    radarCards: [],
    config: {},
  });

  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Config editable state
  const [actionSubtitle, setActionSubtitle] = useState("Top action today · Asian Games");
  const [agendaDateTitle, setAgendaDateTitle] = useState("Tuesday · 23 September");
  const [briefSubtitle, setBriefSubtitle] = useState("Top 5 stories to know today");

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/welcomemessage?includeInactive=true");
      if (res.data.success && res.data.data) {
        setData(res.data.data);
        if (res.data.data.config) {
          setActionSubtitle(res.data.data.config.actionSubtitle || "Top action today · Asian Games");
          setAgendaDateTitle(res.data.data.config.agendaDateTitle || "Tuesday · 23 September");
          setBriefSubtitle(res.data.data.config.briefSubtitle || "Top 5 stories to know today");
        }
      }
    } catch (err) {
      console.error("Failed to load home card management data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingConfig(true);
      setConfigSaved(false);
      await axios.put("/api/welcomemessage", {
        id: "config_welcome",
        type: "welcome_config",
        actionSubtitle,
        agendaDateTitle,
        briefSubtitle,
      });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save welcome config", err);
      alert("Failed to save configuration");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 p-[1.5px]">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                🏠
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Home Cards & Welcome Message Management
              </h1>
              <p className="text-sm text-gray-400">
                Manage Morning Brief stories, Today&apos;s Agenda events, and Welcome header settings in DynamoDB (<code className="text-amber-400">homeDatabase</code>)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/homecardmanagement/MorningBrief/add">
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all shadow-md">
              <Plus size={15} />
              <span>Add Morning Story</span>
            </button>
          </Link>
          <Link href="/admin/homecardmanagement/TodaysAgenda/add">
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-black transition-all shadow-md">
              <Plus size={15} />
              <span>Add Agenda Event</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Morning Brief Card */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-amber-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Morning Brief
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Sun size={18} />
            </div>
          </div>
          <div className="my-3">
            <span className="text-3xl font-black text-white">
              {loading ? "..." : data.morningBrief.length}
            </span>
            <span className="text-xs text-gray-400 ml-2">Stories</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-emerald-400 font-bold">
              {data.morningBrief.filter((s) => s.active !== false).length} Active
            </span>
            <Link
              href="/admin/homecardmanagement/MorningBrief/list"
              className="text-amber-400 hover:underline flex items-center gap-0.5 font-bold"
            >
              Manage <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Today's Agenda Card */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-purple-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Today&apos;s Agenda
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Calendar size={18} />
            </div>
          </div>
          <div className="my-3">
            <span className="text-3xl font-black text-white">
              {loading ? "..." : data.todaysAgenda.length}
            </span>
            <span className="text-xs text-gray-400 ml-2">Events</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-emerald-400 font-bold">
              {data.todaysAgenda.filter((e) => e.statusType === "live").length} Live Now
            </span>
            <Link
              href="/admin/homecardmanagement/TodaysAgenda/list"
              className="text-purple-400 hover:underline flex items-center gap-0.5 font-bold"
            >
              Manage <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Radar Cards */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-cyan-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              Today on Radar
            </span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Radio size={18} />
            </div>
          </div>
          <div className="my-3">
            <span className="text-3xl font-black text-white">
              {loading ? "..." : data.radarCards.length}
            </span>
            <span className="text-xs text-gray-400 ml-2">Carousel Cards</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-gray-400">Dynamic in DynamoDB</span>
            <span className="text-cyan-400 font-bold">Synced</span>
          </div>
        </div>

        {/* Database Status */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-emerald-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              DynamoDB Table
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Layers size={18} />
            </div>
          </div>
          <div className="my-3">
            <span className="text-lg font-black text-white truncate block">
              homeDatabase
            </span>
            <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1 font-semibold">
              <CheckCircle2 size={13} /> Connected & Active
            </span>
          </div>
          <div className="pt-2 border-t border-white/5 text-xs text-gray-400 flex justify-between">
            <span>Region: us-east-1</span>
            <button onClick={fetchData} className="text-emerald-400 hover:underline font-bold">
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Management Modules & Header Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Quick Modules Cards */}
        <div className="lg:col-span-2 space-y-6">
          {/* Morning Brief Module Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1C1408] via-[#120F0A] to-[#0A0805] border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🌞</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                  Morning Brief Module
                </h3>
              </div>
              <p className="text-xs text-gray-300 max-w-md leading-relaxed">
                Add, edit, reorder, or toggle the 5 daily headline stories shown when fans tap &quot;Read Brief&quot; on the home screen.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href="/admin/homecardmanagement/MorningBrief/list">
                <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5">
                  <List size={14} />
                  <span>View All ({data.morningBrief.length})</span>
                </button>
              </Link>
              <Link href="/admin/homecardmanagement/MorningBrief/add">
                <button className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-colors flex items-center gap-1.5 shadow-md">
                  <Plus size={14} />
                  <span>Add Story</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Today's Agenda Module Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1A0D2E] via-[#10091D] to-[#07050E] border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📅</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                  Today&apos;s Agenda Timeline
                </h3>
              </div>
              <p className="text-xs text-gray-300 max-w-md leading-relaxed">
                Manage the schedule timeline events (Badminton, Cricket, Shooting, Swimming, etc.) with LIVE, UP NEXT, and AFTERNOON badges.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href="/admin/homecardmanagement/TodaysAgenda/list">
                <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5">
                  <List size={14} />
                  <span>View All ({data.todaysAgenda.length})</span>
                </button>
              </Link>
              <Link href="/admin/homecardmanagement/TodaysAgenda/add">
                <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white font-extrabold text-xs transition-colors flex items-center gap-1.5 shadow-md">
                  <Plus size={14} />
                  <span>Add Event</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Recent Morning Brief Stories Preview */}
          <div className="p-5 rounded-2xl bg-[#111625] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-white uppercase tracking-wide flex items-center gap-2">
                <span>🌞</span> Live Morning Brief Stories ({data.morningBrief.length})
              </h4>
              <Link href="/admin/homecardmanagement/MorningBrief/list" className="text-xs text-amber-400 hover:underline font-bold">
                View Full List
              </Link>
            </div>

            <div className="space-y-2">
              {data.morningBrief.slice(0, 5).map((story, i) => (
                <div key={story.id || i} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center shrink-0">
                      {story.storyNumber || i + 1}
                    </span>
                    <span className="text-lg">{story.icon || "🏆"}</span>
                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-white truncate">{story.title}</h5>
                      <p className="text-[11px] text-gray-400 truncate">{story.description}</p>
                    </div>
                  </div>
                  <Link href={`/admin/homecardmanagement/MorningBrief/add?editId=${story.id}`}>
                    <span className="text-[11px] text-gray-400 hover:text-white px-2 py-1 rounded bg-white/5 border border-white/10 shrink-0">
                      Edit
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Welcome Message Header Configurations */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-white/10 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Sparkles size={18} className="text-pink-500" />
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Header & Dates Config
                </h3>
                <p className="text-[11px] text-gray-400">
                  Controls global text titles shown on home screen
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  Home Greeting Subtitle
                </label>
                <input
                  type="text"
                  value={actionSubtitle}
                  onChange={(e) => setActionSubtitle(e.target.value)}
                  placeholder="e.g. Top action today · Asian Games"
                  className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  Today&apos;s Agenda Date Label
                </label>
                <input
                  type="text"
                  value={agendaDateTitle}
                  onChange={(e) => setAgendaDateTitle(e.target.value)}
                  placeholder="e.g. Tuesday · 23 September"
                  className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  Morning Brief Subtitle
                </label>
                <input
                  type="text"
                  value={briefSubtitle}
                  onChange={(e) => setBriefSubtitle(e.target.value)}
                  placeholder="e.g. Top 5 stories to know today"
                  className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={savingConfig}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#E91E8C] to-[#FF6B35] hover:opacity-95 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {savingConfig ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : configSaved ? (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Saved to DynamoDB!</span>
                  </>
                ) : (
                  <>
                    <Save size={15} />
                    <span>Save Header Settings</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Quick Info Box */}
          <div className="p-3.5 rounded-xl bg-[#090C15] border border-white/5 space-y-1 text-[11px] text-gray-400">
            <p className="text-gray-300 font-bold">✨ Real-time DynamoDB Sync</p>
            <p>
              Any changes made here in admin reflect immediately on the SportsFan360 Home Page without requiring code redeployment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
