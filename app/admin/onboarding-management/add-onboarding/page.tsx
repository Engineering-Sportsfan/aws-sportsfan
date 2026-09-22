// app/admin/onboarding-management/add-onboarding/page.tsx
'use client';

import { useEffect, useState } from "react";
import axios from "axios";

type ConfigType = "sports" | "followEntities" | "engagement" | "requestedSports";

type ConfigItem = {
  id: string;
  label: string;
  order: number;
  active: boolean;
  image?: string; // sports icon (data URL or hosted URL)
  icon?: string; // engagement icon (emoji) / followEntities badge text
  tag?: string; // e.g. "coming soon" badge
  description?: string; // engagement description (stored as `subtitle` on the record)
  category?: string; // followEntities section / title
  title?: string; // alias for category
  sportId?: string; // followEntities section's sport
};

const CONFIG_API = "/api/roar/onboarding-config";

const inputClass =
  "w-full border border-gray-600 rounded px-3 py-2 bg-gray-800 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-orange-400";
const labelClass = "block text-xs font-medium text-gray-400 mb-1";

// Reads a File into a data URL. Swap this out for a real upload endpoint
// (e.g. Firebase Storage) once one exists — this keeps the panel usable now.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const DEFAULT_QUESTIONS: Record<ConfigType, { question: string; subtitle: string; stepNumber: number; stepLabel: string }> = {
  sports: {
    question: "What sports do you follow?",
    subtitle: "Select one or more sports to personalize your feed & live rooms",
    stepNumber: 1,
    stepLabel: "Sports",
  },
  followEntities: {
    question: "What do you follow?",
    subtitle: "<pick 1 or more>",
    stepNumber: 2,
    stepLabel: "What do you follow?",
  },
  engagement: {
    question: "How do you like your sports?",
    subtitle: "<pick 1 or more>",
    stepNumber: 3,
    stepLabel: "How do you like your sports?",
  },
  requestedSports: {
    question: "Don't see your favorite sports?",
    subtitle: "Please select and we will work hard to get it to you soonest",
    stepNumber: 2,
    stepLabel: "Requested Sports",
  },
};

const DEFAULT_TITLES = ["Sports", "Teams", "Athletes", "Competitions"];

const SPREADSHEET_SPORTS_OPTIONS = [
  { label: "Cricket", tag: "", active: true },
  { label: "Football (coming soon)", tag: "coming soon", active: true },
  { label: "Track & Field (Athletics)", tag: "", active: true },
  { label: "Multi-sports Olympics, Asian Games", tag: "", active: true },
];

export default function OnboardingConfigAdmin() {
  const [tab, setTab] = useState<ConfigType>("sports");
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [sportsList, setSportsList] = useState<ConfigItem[]>([]); // for followEntities section sport dropdown
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Question & Subtitle state for the active tab/step
  const [questionData, setQuestionData] = useState<{ question: string; subtitle: string }>({
    question: DEFAULT_QUESTIONS.sports.question,
    subtitle: DEFAULT_QUESTIONS.sports.subtitle,
  });
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [questionSavedToast, setQuestionSavedToast] = useState(false);

  // sports / engagement: single-item edit form
  const [editing, setEditing] = useState<any | null>(null);

  // followEntities: Title (Category) state
  const [activeTitle, setActiveTitle] = useState<string>("Sports");
  const [customTitles, setCustomTitles] = useState<string[]>([]);
  const [isAddingTitle, setIsAddingTitle] = useState(false);
  const [newTitleName, setNewTitleName] = useState("");
  const [renamingTitle, setRenamingTitle] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // followEntities: Options state
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkOptionsInput, setBulkOptionsInput] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const [showSingleAdd, setShowSingleAdd] = useState(false);
  const [singleOptionDraft, setSingleOptionDraft] = useState({
    label: "",
    tag: "",
    icon: "",
    sportId: "",
    isComingSoon: false,
  });
  const [editingEntity, setEditingEntity] = useState<ConfigItem | null>(null);

  // "Don't see your favorite sports?" Dropdown config & options state
  const [requestedSportsItems, setRequestedSportsItems] = useState<ConfigItem[]>([]);
  const [requestedSportsDemand, setRequestedSportsDemand] = useState<Record<string, number>>({});
  const [requestedSportsQuestion, setRequestedSportsQuestion] = useState({
    question: "Don't see your favorite sports?",
    subtitle: "Please select and we will work hard to get it to you soonest",
  });
  const [isEditingRequestedPrompt, setIsEditingRequestedPrompt] = useState(false);
  const [isSavingRequestedQuestion, setIsSavingRequestedQuestion] = useState(false);
  const [newRequestedSportInput, setNewRequestedSportInput] = useState("");
  const [isAddingRequestedSport, setIsAddingRequestedSport] = useState(false);

  const load = async (type: ConfigType) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await axios.get(`${CONFIG_API}?type=${type}&all=true`);
      setItems(res.data.items ?? []);
      setQuestionData({
        question: res.data.question || DEFAULT_QUESTIONS[type]?.question || "",
        subtitle: res.data.subtitle !== undefined ? res.data.subtitle : (DEFAULT_QUESTIONS[type]?.subtitle || ""),
      });
    } catch (err: any) {
      console.error(err);
      setItems([]);
      setQuestionData({
        question: DEFAULT_QUESTIONS[type]?.question || "",
        subtitle: DEFAULT_QUESTIONS[type]?.subtitle || "",
      });
      setLoadError(
        err?.response?.status
          ? `Failed to load (${err.response.status}). Check that ${CONFIG_API} exists and you're logged in as an admin.`
          : "Failed to reach the config API. Check your connection and that the route exists."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadRequestedSports = async () => {
    try {
      const res = await axios.get(`${CONFIG_API}?type=requestedSports&all=true&demand=true`);
      if (res.data?.items) {
        setRequestedSportsItems(res.data.items);
      }
      if (res.data?.demand) {
        setRequestedSportsDemand(res.data.demand);
      }
      if (res.data?.question) {
        setRequestedSportsQuestion({
          question: res.data.question,
          subtitle: res.data.subtitle ?? "",
        });
      }
    } catch (e) {
      console.warn("loadRequestedSports failed:", e);
    }
  };

  const handleSaveRequestedPrompt = async () => {
    if (!requestedSportsQuestion.question.trim()) return;
    setIsSavingRequestedQuestion(true);
    try {
      await axios.put(CONFIG_API, {
        type: "requestedSports",
        question: requestedSportsQuestion.question.trim(),
        subtitle: requestedSportsQuestion.subtitle.trim(),
      });
      setIsEditingRequestedPrompt(false);
    } catch (e) {
      console.error(e);
      alert("Failed to update prompt");
    } finally {
      setIsSavingRequestedQuestion(false);
    }
  };

  const handleAddRequestedSport = async () => {
    const label = newRequestedSportInput.trim();
    if (!label) return;
    setIsAddingRequestedSport(true);
    try {
      await axios.post(CONFIG_API, {
        type: "requestedSports",
        item: {
          label,
          active: true,
          order: requestedSportsItems.length + 1,
        },
      });
      setNewRequestedSportInput("");
      await loadRequestedSports();
    } catch (e) {
      console.error(e);
      alert("Failed to add sport option");
    } finally {
      setIsAddingRequestedSport(false);
    }
  };

  const handleDeleteRequestedSport = async (id: string) => {
    if (!confirm("Delete this sport request option?")) return;
    try {
      await axios.delete(`${CONFIG_API}?type=requestedSports&id=${id}`);
      await loadRequestedSports();
    } catch (e) {
      console.error(e);
      alert("Failed to delete option");
    }
  };

  const handlePreloadDefaultRequestedSports = async () => {
    const defaults = [
      "Basketball",
      "Tennis",
      "Badminton",
      "Formula 1 / Motorsports",
      "Hockey",
      "Kabaddi",
      "Baseball",
      "Volleyball",
      "Table Tennis",
    ];
    try {
      await axios.post(CONFIG_API, {
        type: "requestedSports",
        items: defaults.map((label, idx) => ({
          label,
          active: true,
          order: idx,
        })),
      });
      await loadRequestedSports();
    } catch (e) {
      console.error(e);
      alert("Failed to preload defaults");
    }
  };

  const handleSaveQuestion = async () => {
    if (!questionData.question.trim()) {
      alert("Question title cannot be blank.");
      return;
    }
    setIsSavingQuestion(true);
    try {
      const res = await axios.put(CONFIG_API, {
        type: tab,
        question: questionData.question,
        subtitle: questionData.subtitle,
      });
      if (res.data.success) {
        setQuestionSavedToast(true);
        setTimeout(() => setQuestionSavedToast(false), 2500);
      }
    } catch (err: any) {
      console.error("Save question failed:", err);
      alert(err?.response?.data?.error || "Failed to save step title/subtitle. Check console.");
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleResetQuestion = () => {
    const def = DEFAULT_QUESTIONS[tab];
    if (def) {
      setQuestionData({ question: def.question, subtitle: def.subtitle });
    }
  };

  useEffect(() => {
    load(tab);
    setEditing(null);
    setEditingEntity(null);
    setShowBulkAdd(false);
    setShowSingleAdd(false);
    setIsAddingTitle(false);
    setRenamingTitle(null);
    if (tab === "followEntities") {
      loadRequestedSports();
      if (sportsList.length === 0) {
        axios
          .get(`${CONFIG_API}?type=sports&all=true`)
          .then((r) => setSportsList(r.data.items ?? []))
          .catch((err) => console.error(err));
      }
    }
  }, [tab]); // eslint-disable-line

  // Compute all available titles (defaults + custom + existing in data)
  const itemCategories = Array.from(
    new Set(items.map((it) => it.category || it.title).filter(Boolean) as string[])
  );
  const allTitles = Array.from(
    new Set([...DEFAULT_TITLES, ...customTitles, ...itemCategories])
  );
  const currentTitleOptions = items.filter(
    (it) => (it.category || it.title) === activeTitle
  );

  // ---------- sports / engagement (flat list) ----------

  const saveFlat = async () => {
    if (!editing) return;
    const payload = { ...editing };
    try {
      if (payload.id) {
        await axios.patch(CONFIG_API, { type: tab, id: payload.id, updates: payload });
        setEditing(null);
      } else {
        await axios.post(CONFIG_API, { type: tab, item: payload });
        setEditing(
          tab === "sports"
            ? { label: "", image: "", active: true, order: items.length + 1 }
            : { label: "", icon: "", subtitle: "", active: true, order: items.length + 1 }
        );
      }
      await load(tab);
    } catch (err) {
      console.error(err);
      alert("Save failed — check the console for details.");
    }
  };

  const remove = async (type: ConfigType, id: string) => {
    if (!confirm("Delete this item?")) return;
    try {
      await axios.delete(`${CONFIG_API}?type=${type}&id=${id}`);
      load(type);
    } catch (err) {
      console.error(err);
      alert("Delete failed — check the console for details.");
    }
  };

  const toggleActive = async (type: ConfigType, item: ConfigItem) => {
    try {
      await axios.patch(CONFIG_API, { type, id: item.id, updates: { active: !item.active } });
      load(type);
    } catch (err) {
      console.error(err);
      alert("Update failed — check the console for details.");
    }
  };

  const handleIconUpload = async (file: File | null) => {
    if (!file || !editing) return;
    const dataUrl = await fileToDataUrl(file);
    setEditing({ ...editing, image: dataUrl });
  };

  // ---------- followEntities (Title & Multiple Options) ----------

  const handleAddTitle = () => {
    const trimmed = newTitleName.trim();
    if (!trimmed) return;
    if (!allTitles.includes(trimmed)) {
      setCustomTitles((prev) => [...prev, trimmed]);
    }
    setActiveTitle(trimmed);
    setNewTitleName("");
    setIsAddingTitle(false);
  };

  const handleRenameTitle = async (oldTitle: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === oldTitle) {
      setRenamingTitle(null);
      return;
    }
    try {
      await axios.post(CONFIG_API, {
        type: "followEntities",
        action: "renameTitle",
        oldTitle,
        newTitle: trimmed,
      });
      setCustomTitles((prev) => prev.map((t) => (t === oldTitle ? trimmed : t)));
      if (activeTitle === oldTitle) setActiveTitle(trimmed);
      setRenamingTitle(null);
      await load("followEntities");
    } catch (err) {
      console.error("Rename title failed:", err);
      alert("Failed to rename title. Check console.");
    }
  };

  const handleDeleteTitle = async (title: string) => {
    const count = items.filter((it) => (it.category || it.title) === title).length;
    if (!confirm(`Delete title "${title}" and all its ${count} option(s)?`)) return;
    try {
      await axios.post(CONFIG_API, {
        type: "followEntities",
        action: "deleteTitle",
        title,
      });
      setCustomTitles((prev) => prev.filter((t) => t !== title));
      const remaining = allTitles.filter((t) => t !== title);
      setActiveTitle(remaining[0] || "Sports");
      await load("followEntities");
    } catch (err) {
      console.error("Delete title failed:", err);
      alert("Failed to delete title. Check console.");
    }
  };

  const handleBulkAddOptions = async () => {
    if (!bulkOptionsInput.trim()) return;
    const lines = bulkOptionsInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    const bulkPayload = lines.map((label, idx) => {
      const isComingSoon = /coming\s*soon/i.test(label);
      return {
        label,
        category: activeTitle,
        title: activeTitle,
        tag: isComingSoon ? "coming soon" : "",
        active: true,
        order: items.length + idx,
      };
    });

    setIsBulkSubmitting(true);
    try {
      await axios.post(CONFIG_API, {
        type: "followEntities",
        items: bulkPayload,
      });
      setBulkOptionsInput("");
      setShowBulkAdd(false);
      await load("followEntities");
    } catch (err) {
      console.error("Bulk add options failed:", err);
      alert("Failed to add options. Check console.");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleCreateSingleOption = async () => {
    if (!singleOptionDraft.label.trim()) return;
    try {
      await axios.post(CONFIG_API, {
        type: "followEntities",
        item: {
          label: singleOptionDraft.label.trim(),
          category: activeTitle,
          title: activeTitle,
          tag: singleOptionDraft.isComingSoon ? "coming soon" : (singleOptionDraft.tag || ""),
          icon: singleOptionDraft.icon || "",
          sportId: singleOptionDraft.sportId || undefined,
          order: items.length,
          active: true,
        },
      });
      setSingleOptionDraft({
        label: "",
        tag: "",
        icon: "",
        sportId: "",
        isComingSoon: false,
      });
      setShowSingleAdd(false);
      await load("followEntities");
    } catch (err) {
      console.error("Add option failed:", err);
      alert("Failed to add option. Check console.");
    }
  };

  const handlePreloadSpreadsheetOptions = async () => {
    setIsBulkSubmitting(true);
    try {
      await axios.post(CONFIG_API, {
        type: "followEntities",
        items: SPREADSHEET_SPORTS_OPTIONS.map((s, idx) => ({
          ...s,
          category: "Sports",
          title: "Sports",
          order: idx,
        })),
      });
      await load("followEntities");
    } catch (err) {
      console.error(err);
      alert("Failed to preload defaults.");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const saveEntity = async () => {
    if (!editingEntity) return;
    try {
      await axios.patch(CONFIG_API, {
        type: "followEntities",
        id: editingEntity.id,
        updates: {
          label: editingEntity.label,
          category: editingEntity.category || editingEntity.title || activeTitle,
          title: editingEntity.title || editingEntity.category || activeTitle,
          tag: editingEntity.tag || "",
          icon: editingEntity.icon || "",
          sportId: editingEntity.sportId || undefined,
        },
      });
      setEditingEntity(null);
      await load("followEntities");
    } catch (err) {
      console.error("Save entity failed:", err);
      alert("Save failed — check console.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 text-gray-100 min-h-screen bg-gray-950">
      <h1 className="text-2xl font-bold mb-4 text-gray-50">ROAR Onboarding Config</h1>

      <div className="flex gap-2 mb-6">
        {(
          [
            { key: "sports", label: "Sports (Step 1)" },
            { key: "followEntities", label: "What do you follow? (Step 2)" },
            { key: "engagement", label: "How do you like your sports? (Step 3)" },
          ] as { key: ConfigType; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              tab === t.key
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-gray-900 text-gray-300 border-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && loadError && (
        <div className="border border-red-800 bg-red-950/40 text-red-300 text-sm rounded-lg p-4 mb-6">
          {loadError}
        </div>
      )}

      {/* ── STEP QUESTION & PROMPT CONFIGURATION (LEVEL 1: QUESTION) ── */}
      {!loading && (
        <div className="border border-gray-700 bg-gray-900 rounded-2xl p-5 mb-8 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            {/* Left Column: Editor Inputs */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    Step {DEFAULT_QUESTIONS[tab].stepNumber} of 3
                  </span>
                  <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                    Step Question & Prompt
                  </h2>
                </div>
                {questionSavedToast && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-700/50 px-3 py-1 rounded-full">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Question Saved!
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-400">
                Edit the primary heading and supporting instructions shown to fans on this onboarding screen.
              </p>

              {/* Main Question Title Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center justify-between">
                  <span>Question / Heading</span>
                  <span className="text-[11px] text-gray-500 font-normal">Shown as main headline</span>
                </label>
                <input
                  type="text"
                  value={questionData.question}
                  onChange={(e) => setQuestionData({ ...questionData, question: e.target.value })}
                  placeholder="e.g. What do you follow?"
                  className="w-full border border-gray-700 rounded-lg px-3.5 py-2.5 bg-gray-950 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-orange-500 text-sm font-medium transition-colors"
                />
              </div>

              {/* Subtitle / Helper Description Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center justify-between">
                  <span>Subtitle / Instructions</span>
                  <span className="text-[11px] text-gray-500 font-normal">Shown below the question</span>
                </label>
                <textarea
                  rows={2}
                  value={questionData.subtitle}
                  onChange={(e) => setQuestionData({ ...questionData, subtitle: e.target.value })}
                  placeholder="e.g. <pick 1 or more>"
                  className="w-full border border-gray-700 rounded-lg px-3.5 py-2 bg-gray-950 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-orange-500 text-sm transition-colors resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSaveQuestion}
                  disabled={isSavingQuestion}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold shadow-md transition-colors"
                >
                  {isSavingQuestion ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Saving Question…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Save Question</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResetQuestion}
                  className="px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium border border-gray-700 transition-colors"
                >
                  Reset to Default
                </button>
              </div>
            </div>

            {/* Right Column: Live Mobile Header Mockup */}
            <div className="lg:w-84 w-full border border-gray-800 bg-gray-950/80 rounded-xl p-4 shadow-inner">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-800">
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  User Screen Preview
                </span>
                <span className="text-[10px] text-gray-500">Mobile Onboarding</span>
              </div>

              <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-lg p-3.5 border border-gray-800 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-gray-400 font-semibold tracking-wider uppercase">
                  <span>Step {DEFAULT_QUESTIONS[tab].stepNumber} of 3</span>
                  <div className="flex gap-1">
                    <span className={`w-3 h-1 rounded-full ${DEFAULT_QUESTIONS[tab].stepNumber >= 1 ? "bg-orange-500" : "bg-gray-700"}`}></span>
                    <span className={`w-3 h-1 rounded-full ${DEFAULT_QUESTIONS[tab].stepNumber >= 2 ? "bg-orange-500" : "bg-gray-700"}`}></span>
                    <span className={`w-3 h-1 rounded-full ${DEFAULT_QUESTIONS[tab].stepNumber >= 3 ? "bg-orange-500" : "bg-gray-700"}`}></span>
                  </div>
                </div>

                <p className="text-base font-bold text-gray-100 leading-snug">
                  {questionData.question || (
                    <span className="text-gray-600 italic">Enter question above…</span>
                  )}
                </p>

                <p className="text-xs text-orange-400 font-medium italic">
                  {questionData.subtitle || (
                    <span className="text-gray-600 italic">Enter subtitle above…</span>
                  )}
                </p>

                {tab === "followEntities" && (
                  <div className="pt-2 border-t border-gray-800 space-y-2">
                    {/* Horizontal Title Pills */}
                    <div className="flex gap-1 overflow-x-auto pb-1 text-[10px]">
                      {allTitles.map((t) => (
                        <span
                          key={t}
                          className={`px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${
                            t === activeTitle
                              ? "bg-orange-500 text-white font-bold"
                              : "bg-gray-800 text-gray-400"
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* Preview of options under active title */}
                    <div className="space-y-1 pt-1 max-h-36 overflow-y-auto pr-1">
                      {currentTitleOptions.slice(0, 5).map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center justify-between px-2.5 py-1 rounded bg-gray-800/80 border border-gray-700/50 text-[11px] text-gray-200"
                        >
                          <span className="truncate">{opt.label}</span>
                          {(opt.tag?.toLowerCase().includes("coming soon") ||
                            opt.label.toLowerCase().includes("coming soon")) && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30 whitespace-nowrap">
                              Coming Soon
                            </span>
                          )}
                        </div>
                      ))}
                      {currentTitleOptions.length === 0 && (
                        <p className="text-[10px] text-gray-500 italic py-1">No options yet under {activeTitle}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── OPTIONS MANAGEMENT SECTION DIVIDER ── */}
      {!loading && (
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-gray-200">
              {tab === "sports" && "Step 1 Options: Selectable Sports"}
              {tab === "followEntities" && "Step 2 Configuration: Titles & Multiple Options"}
              {tab === "engagement" && "Step 3 Options: Engagement Modes"}
            </h3>
            <p className="text-xs text-gray-500">
              {tab === "sports" && `Configure the sports cards fans can choose from (${items.length} total)`}
              {tab === "followEntities" && `Configure categories (Titles) and the multiple options fans can pick under each`}
              {tab === "engagement" && `Configure play modes and feature preferences (${items.length} total)`}
            </p>
          </div>
        </div>
      )}

      {/* ---------------- SPORTS ---------------- */}
      {!loading && tab === "sports" && (
        <>
          <button
            onClick={() => setEditing({ label: "", image: "", active: true, order: items.length })}
            className="mb-4 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
          >
            + Add sport
          </button>

          {editing && (
            <div className="border border-gray-700 rounded-xl p-4 mb-6 bg-gray-900 space-y-3 shadow-lg max-w-md">
              <div>
                <label className={labelClass}>Icon</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleIconUpload(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-gray-700 file:text-gray-100 file:cursor-pointer"
                />
                {editing.image && (
                  <img
                    src={editing.image}
                    alt="preview"
                    className="w-12 h-12 object-contain mt-2 rounded bg-gray-800 p-1"
                  />
                )}
              </div>
              <div>
                <label className={labelClass}>Sport name</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Cricket"
                  value={editing.label || ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveFlat}
                  className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border border-gray-700 rounded-lg px-4 py-3 bg-gray-900"
              >
                <div className="flex items-center gap-3">
                  {item.image && (
                    <img src={item.image} alt="" className="w-8 h-8 object-contain rounded bg-gray-800 p-1" />
                  )}
                  <p className="font-medium text-gray-100">
                    {item.label} {!item.active && <span className="text-xs text-red-400">(inactive)</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleActive("sports", item)}
                    className="text-xs px-3 py-1.5 rounded bg-gray-800 text-gray-200 border border-gray-600"
                  >
                    {item.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="text-xs px-3 py-1.5 rounded bg-blue-900 text-blue-200 border border-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove("sports", item.id)}
                    className="text-xs px-3 py-1.5 rounded bg-red-900 text-red-200 border border-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && !loadError && <p className="text-sm text-gray-500">No sports yet.</p>}
          </div>
        </>
      )}

      {/* ---------------- FOLLOW ENTITIES (QUESTION 2: QUESTION -> TITLE -> MULTIPLE OPTIONS) ---------------- */}
      {!loading && tab === "followEntities" && (
        <div className="space-y-6">
          {/* LEVEL 2: TITLE (CATEGORY) SELECTOR & MANAGEMENT */}
          <div className="border border-gray-800 bg-gray-900/90 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-800">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">
                  Level 2 • Titles / Categories
                </span>
                <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
                  Step 2 Titles (e.g. Sports, Teams, Athletes, Competitions)
                </h3>
                <p className="text-xs text-gray-400">
                  Select a title to manage its multiple options below, or add custom titles.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isAddingTitle && (
                  <button
                    onClick={() => setIsAddingTitle(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 flex items-center gap-1.5 transition-colors"
                  >
                    <span>+ Add Title</span>
                  </button>
                )}
              </div>
            </div>

            {/* Inline Add Title Form */}
            {isAddingTitle && (
              <div className="mb-4 p-3 bg-gray-950 border border-orange-500/40 rounded-xl flex items-center gap-2 max-w-md">
                <input
                  className={inputClass}
                  placeholder="e.g. Competitions or Tournaments"
                  value={newTitleName}
                  autoFocus
                  onChange={(e) => setNewTitleName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTitle()}
                />
                <button
                  onClick={handleAddTitle}
                  className="px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Add Title
                </button>
                <button
                  onClick={() => {
                    setIsAddingTitle(false);
                    setNewTitleName("");
                  }}
                  className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Horizontal Title Tabs / Badges */}
            <div className="flex flex-wrap gap-2 items-center">
              {allTitles.map((titleName) => {
                const count = items.filter(
                  (it) => (it.category || it.title) === titleName
                ).length;
                const isSelected = activeTitle === titleName;
                return (
                  <div
                    key={titleName}
                    className={`group flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                      isSelected
                        ? "bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20"
                        : "bg-gray-950 text-gray-300 border-gray-800 hover:border-gray-700 hover:bg-gray-800/80"
                    }`}
                    onClick={() => {
                      setActiveTitle(titleName);
                      setShowBulkAdd(false);
                      setShowSingleAdd(false);
                    }}
                  >
                    <span>{titleName}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isSelected
                          ? "bg-black/30 text-white"
                          : "bg-gray-800 text-gray-400 group-hover:text-gray-300"
                      }`}
                    >
                      {count}
                    </span>

                    {/* Actions on Title when selected */}
                    {isSelected && (
                      <div
                        className="flex items-center gap-1 ml-2 pl-2 border-l border-white/20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          title="Rename Title"
                          onClick={() => {
                            setRenamingTitle(titleName);
                            setRenameValue(titleName);
                          }}
                          className="hover:text-amber-200 text-white/80 p-0.5 text-[11px]"
                        >
                          ✎
                        </button>
                        <button
                          title="Delete Title"
                          onClick={() => handleDeleteTitle(titleName)}
                          className="hover:text-red-200 text-white/80 p-0.5 text-[11px]"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Inline Rename Title Dialog */}
            {renamingTitle && (
              <div className="mt-3 p-3 bg-gray-950 border border-blue-500/40 rounded-xl flex items-center gap-2 max-w-md">
                <span className="text-xs text-gray-400 whitespace-nowrap">Rename "{renamingTitle}":</span>
                <input
                  className={inputClass}
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRenameTitle(renamingTitle, renameValue)}
                />
                <button
                  onClick={() => handleRenameTitle(renamingTitle, renameValue)}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Save
                </button>
                <button
                  onClick={() => setRenamingTitle(null)}
                  className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* LEVEL 3: MULTIPLE OPTIONS UNDER ACTIVE TITLE */}
          <div className="border border-gray-800 bg-gray-900/90 rounded-2xl p-5 shadow-lg space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
                    Level 3 • Multiple Options
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30">
                    Title: {activeTitle}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-100 mt-1">
                  Options for "{activeTitle}" ({currentTitleOptions.length} total)
                </h3>
                <p className="text-xs text-gray-400">
                  Add multiple options that fans can pick when viewing "{activeTitle}".
                </p>
              </div>

              {/* Action Buttons for adding options */}
              <div className="flex flex-wrap items-center gap-2">
                {activeTitle === "Sports" && currentTitleOptions.length === 0 && (
                  <button
                    onClick={handlePreloadSpreadsheetOptions}
                    disabled={isBulkSubmitting}
                    className="px-3.5 py-2 rounded-lg bg-amber-600/30 hover:bg-amber-600/40 text-amber-300 text-xs font-semibold border border-amber-500/40 flex items-center gap-1.5 transition-colors"
                  >
                    <span>⚡ Preload Spreadsheet Options</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowBulkAdd(!showBulkAdd);
                    setShowSingleAdd(false);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                    showBulkAdd
                      ? "bg-emerald-600 text-white border-emerald-500"
                      : "bg-gray-800 hover:bg-gray-700 text-emerald-400 border-gray-700"
                  }`}
                >
                  <span>⚡ Quick Add Multiple Options</span>
                </button>

                <button
                  onClick={() => {
                    setShowSingleAdd(!showSingleAdd);
                    setShowBulkAdd(false);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                    showSingleAdd
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-gray-800 hover:bg-gray-700 text-orange-400 border-gray-700"
                  }`}
                >
                  <span>+ Add Single Option</span>
                </button>
              </div>
            </div>

            {/* QUICK BULK ADD FORM */}
            {showBulkAdd && (
              <div className="p-4 bg-gray-950 border border-emerald-500/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚡</span> Bulk Add Multiple Options to "{activeTitle}"
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Separate by commas or newlines. Tag "(coming soon)" will auto-badge.
                  </span>
                </div>

                <textarea
                  rows={3}
                  value={bulkOptionsInput}
                  onChange={(e) => setBulkOptionsInput(e.target.value)}
                  placeholder="e.g. Cricket, Football (coming soon), Track & Field (Athletics), Multi-sports Olympics, Asian Games"
                  className="w-full border border-gray-700 rounded-lg px-3.5 py-2.5 bg-gray-900 text-gray-100 placeholder-gray-500 text-xs focus:outline-none focus:border-emerald-500 resize-none font-mono"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBulkAddOptions}
                    disabled={isBulkSubmitting || !bulkOptionsInput.trim()}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    {isBulkSubmitting ? "Adding…" : "Add All Options"}
                  </button>
                  <button
                    onClick={() => {
                      setShowBulkAdd(false);
                      setBulkOptionsInput("");
                    }}
                    className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* SINGLE OPTION ADD FORM */}
            {showSingleAdd && (
              <div className="p-4 bg-gray-950 border border-orange-500/40 rounded-xl space-y-3 max-w-md">
                <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                  + Add Option to "{activeTitle}"
                </p>

                <div>
                  <label className={labelClass}>Option Label</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. Football or Mumbai Indians"
                    value={singleOptionDraft.label}
                    onChange={(e) =>
                      setSingleOptionDraft({ ...singleOptionDraft, label: e.target.value })
                    }
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={singleOptionDraft.isComingSoon}
                      onChange={(e) =>
                        setSingleOptionDraft({
                          ...singleOptionDraft,
                          isComingSoon: e.target.checked,
                        })
                      }
                      className="rounded border-gray-700 text-amber-500 focus:ring-0 w-4 h-4 bg-gray-900 cursor-pointer"
                    />
                    <span>Mark as "Coming Soon" (displays badge)</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Badge / Icon (optional)</label>
                    <input
                      className={inputClass}
                      placeholder="e.g. IN or 🏏"
                      value={singleOptionDraft.icon}
                      onChange={(e) =>
                        setSingleOptionDraft({ ...singleOptionDraft, icon: e.target.value })
                      }
                    />
                  </div>

                  {(activeTitle === "Teams" || activeTitle === "Athletes") && (
                    <div>
                      <label className={labelClass}>Sport (optional)</label>
                      <select
                        className={inputClass}
                        value={singleOptionDraft.sportId}
                        onChange={(e) =>
                          setSingleOptionDraft({ ...singleOptionDraft, sportId: e.target.value })
                        }
                      >
                        <option value="">Any Sport…</option>
                        {sportsList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleCreateSingleOption}
                    className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold"
                  >
                    Save Option
                  </button>
                  <button
                    onClick={() => setShowSingleAdd(false)}
                    className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* EDITING OPTION MODAL / INLINE FORM */}
            {editingEntity && (
              <div className="p-4 bg-gray-950 border border-blue-500/40 rounded-xl space-y-3 max-w-md">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  Edit Option
                </p>
                <div>
                  <label className={labelClass}>Option Label</label>
                  <input
                    className={inputClass}
                    value={editingEntity.label || ""}
                    onChange={(e) =>
                      setEditingEntity({ ...editingEntity, label: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Badge / Tag text (e.g. coming soon)</label>
                  <input
                    className={inputClass}
                    value={editingEntity.tag || ""}
                    placeholder="e.g. coming soon"
                    onChange={(e) =>
                      setEditingEntity({ ...editingEntity, tag: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Icon / Badge text</label>
                  <input
                    className={inputClass}
                    value={editingEntity.icon || ""}
                    onChange={(e) =>
                      setEditingEntity({ ...editingEntity, icon: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={saveEntity}
                    className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditingEntity(null)}
                    className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* LIST OF OPTIONS FOR CURRENT TITLE */}
            <div className="space-y-2">
              {currentTitleOptions.map((opt) => {
                const isComingSoon =
                  opt.tag?.toLowerCase().includes("coming soon") ||
                  opt.label.toLowerCase().includes("coming soon");
                return (
                  <div
                    key={opt.id}
                    className="flex items-center justify-between border border-gray-800 rounded-xl px-4 py-3 bg-gray-950 hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {opt.icon && (
                        <span className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-orange-400">
                          {opt.icon}
                        </span>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-100 text-sm">{opt.label}</p>
                          {isComingSoon && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                              <span>⏱️</span> Coming Soon
                            </span>
                          )}
                          {!opt.active && (
                            <span className="text-xs text-red-400 font-normal">(inactive)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive("followEntities", opt)}
                        className="text-xs px-2.5 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700"
                      >
                        {opt.active ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => setEditingEntity(opt)}
                        className="text-xs px-2.5 py-1 rounded bg-blue-900/60 text-blue-300 border border-blue-700/60 hover:bg-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove("followEntities", opt.id)}
                        className="text-xs px-2.5 py-1 rounded bg-red-900/60 text-red-300 border border-red-700/60 hover:bg-red-900"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}

              {currentTitleOptions.length === 0 && (
                <div className="p-8 text-center border border-dashed border-gray-800 rounded-2xl bg-gray-950/50">
                  <p className="text-sm font-semibold text-gray-300 mb-1">
                    No options configured under "{activeTitle}" yet
                  </p>
                  <p className="text-xs text-gray-500 mb-4">
                    Click "⚡ Quick Add Multiple Options" to paste multiple options, or "+ Add Single Option".
                  </p>
                  {activeTitle === "Sports" && (
                    <button
                      onClick={handlePreloadSpreadsheetOptions}
                      className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold"
                    >
                      Preload Spreadsheet Options (Cricket, Football, Athletics, Olympics)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* SPREADSHEET FOOTER ROW (Rows 7-9: "Don't see your favorite sports?") */}
            {activeTitle === "Sports" && (
              <div className="p-5 rounded-2xl border border-gray-700 bg-gray-900/60 mt-6 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🎯</span>
                      <p className="text-sm font-bold text-white">
                        {requestedSportsQuestion.question}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {requestedSportsQuestion.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingRequestedPrompt(!isEditingRequestedPrompt)}
                      className="text-xs px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 cursor-pointer"
                    >
                      {isEditingRequestedPrompt ? "Close Edit" : "✏️ Edit Prompt"}
                    </button>
                    {requestedSportsItems.length === 0 && (
                      <button
                        type="button"
                        onClick={handlePreloadDefaultRequestedSports}
                        className="text-xs px-3 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white font-semibold cursor-pointer"
                      >
                        ⚡ Preload Top 16 Sports
                      </button>
                    )}
                  </div>
                </div>

                {/* Edit Question & Subtitle inline form */}
                {isEditingRequestedPrompt && (
                  <div className="p-4 rounded-xl bg-gray-950 border border-orange-500/30 space-y-3">
                    <div>
                      <label className={labelClass}>Header Question</label>
                      <input
                        type="text"
                        value={requestedSportsQuestion.question}
                        onChange={(e) =>
                          setRequestedSportsQuestion((prev) => ({ ...prev, question: e.target.value }))
                        }
                        className={inputClass}
                        placeholder="Don't see your favorite sports?"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Subtitle Description</label>
                      <input
                        type="text"
                        value={requestedSportsQuestion.subtitle}
                        onChange={(e) =>
                          setRequestedSportsQuestion((prev) => ({ ...prev, subtitle: e.target.value }))
                        }
                        className={inputClass}
                        placeholder="Please select and we will work hard to get it to you soonest"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingRequestedPrompt(false)}
                        className="text-xs px-3 py-1.5 rounded bg-gray-800 text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSavingRequestedQuestion}
                        onClick={handleSaveRequestedPrompt}
                        className="text-xs px-4 py-1.5 rounded bg-orange-500 hover:bg-orange-600 text-white font-semibold"
                      >
                        {isSavingRequestedQuestion ? "Saving..." : "Save Prompt"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Dropdown Options List & Manager */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-300">
                      Dropdown Options ({requestedSportsItems.length})
                    </p>
                    {requestedSportsItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handlePreloadDefaultRequestedSports}
                        className="text-[11px] text-orange-400 hover:text-orange-300 cursor-pointer"
                      >
                        ⚡ Re-seed Defaults
                      </button>
                    )}
                  </div>

                  {/* Add New Sport Option Field */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRequestedSportInput}
                      onChange={(e) => setNewRequestedSportInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddRequestedSport()}
                      placeholder="Add a new sport option (e.g. Pickleball, Swimming)..."
                      className={`${inputClass} text-xs py-1.5`}
                    />
                    <button
                      type="button"
                      disabled={isAddingRequestedSport || !newRequestedSportInput.trim()}
                      onClick={handleAddRequestedSport}
                      className="px-4 py-1.5 rounded bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      {isAddingRequestedSport ? "Adding..." : "+ Add Option"}
                    </button>
                  </div>

                  {/* Current Options Chips with User Demand Badge */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {requestedSportsItems.map((sport) => {
                      const demandCount = requestedSportsDemand[sport.label] || 0;
                      return (
                        <div
                          key={sport.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs text-white"
                        >
                          <span>{sport.label}</span>
                          {demandCount > 0 && (
                            <span className="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-orange-500/40">
                              🔥 {demandCount} {demandCount === 1 ? "request" : "requests"}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteRequestedSport(sport.id)}
                            className="text-gray-400 hover:text-red-400 ml-1 cursor-pointer"
                            title="Delete option"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                    {requestedSportsItems.length === 0 && (
                      <p className="text-xs text-gray-500 italic">
                        No custom sport options added yet. Click "⚡ Preload Top 16 Sports" or type one above.
                      </p>
                    )}
                  </div>
                </div>

                {/* Live Dropdown Preview */}
                <div className="pt-3 border-t border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-gray-400">
                    Live User Preview:
                  </span>
                  <div className="sm:w-72 w-full">
                    <select
                      className="w-full text-xs bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 cursor-pointer focus:border-orange-400 focus:outline-none"
                    >
                      <option value="">Select custom sport request…</option>
                      {requestedSportsItems.map((s) => (
                        <option key={s.id} value={s.label}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- ENGAGEMENT ---------------- */}
      {!loading && tab === "engagement" && (
        <>
          <button
            onClick={() =>
              setEditing({ label: "", icon: "", description: "", active: true, order: items.length })
            }
            className="mb-4 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
          >
            + Add option
          </button>

          {editing && (
            <div className="border border-gray-700 rounded-xl p-4 mb-6 bg-gray-900 space-y-3 shadow-lg max-w-md">
              <div>
                <label className={labelClass}>Icon (emoji)</label>
                <input
                  className={inputClass}
                  placeholder="🎯"
                  value={editing.icon || ""}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Title</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Predicting outcomes & scores"
                  value={editing.label || ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Get prediction prompts before and during matches"
                  value={editing.subtitle || ""}
                  onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveFlat}
                  className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border border-gray-700 rounded-lg px-4 py-3 bg-gray-900"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-lg">
                    {item.icon || "⭐"}
                  </span>
                  <div>
                    <p className="font-medium text-gray-100">
                      {item.label} {!item.active && <span className="text-xs text-red-400">(inactive)</span>}
                    </p>
                    <p className="text-xs text-gray-500">{(item as any).subtitle}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleActive("engagement", item)}
                    className="text-xs px-3 py-1.5 rounded bg-gray-800 text-gray-200 border border-gray-600"
                  >
                    {item.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="text-xs px-3 py-1.5 rounded bg-blue-900 text-blue-200 border border-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove("engagement", item.id)}
                    className="text-xs px-3 py-1.5 rounded bg-red-900 text-red-200 border border-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && !loadError && <p className="text-sm text-gray-500">No options yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}