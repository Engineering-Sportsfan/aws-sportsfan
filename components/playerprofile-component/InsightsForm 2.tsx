"use client";

import axios from "axios";
import { useState } from "react";
import {
  Insight,
  SectionTitle,
  Divider,
  AddButton,
  EmptyState,
  FormActions,
} from "./shared";

// ─── PROPS 

type Props = {
  playerProfilesId: string;
  insightsDocId?: string;
  initialInsights?: Insight[];
  initialStrengths?: string[];
  onSaved: (insightsDocId: string) => void;
  onBack: () => void;
};

// ─── COMPONENT ─────────────────────────────────────────────────────────────────

export default function InsightsForm({
  playerProfilesId,
  insightsDocId,
  initialInsights = [],
  initialStrengths = [],
  onSaved,
  onBack,
}: Props) {
  const [insights, setInsights] = useState<Insight[]>(initialInsights);
  const [strengths, setStrengths] = useState<string[]>(initialStrengths);
  const [loading, setLoading] = useState(false);

  // ── Insights handlers ──────────────────────────────────────────────────────
  const addInsight = () =>
    setInsights((p) => [...p, { title: "", description: "" }]);

  const updateInsight = (i: number, key: keyof Insight, val: string) => {
    const updated = [...insights];
    updated[i][key] = val;
    setInsights(updated);
  };

  const removeInsight = (i: number) =>
    setInsights((p) => p.filter((_, idx) => idx !== i));

  // ── Strengths handlers ─────────────────────────────────────────────────────
  const addStrength = () => setStrengths((p) => [...p, ""]);

  const updateStrength = (i: number, val: string) => {
    const updated = [...strengths];
    updated[i] = val;
    setStrengths(updated);
  };

  const removeStrength = (i: number) =>
    setStrengths((p) => p.filter((_, idx) => idx !== i));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = { playerProfilesId, insights, strengths };
      let res;
      if (insightsDocId) {
        res = await axios.put(
          `/api/player-profile/insights/${insightsDocId}`,
          payload
        );
        onSaved(insightsDocId);
      } else {
        res = await axios.post("/api/player-profile/insights", payload);
        onSaved(res.data.insightsDoc.id);
      }
      if (res.data.success) {
        alert(insightsDocId ? "Insights updated!" : "Insights created!");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
      {/* ── Insights ── */}
      <div className="flex items-center justify-between">
        <SectionTitle title="Insights" noMargin />
        <AddButton onClick={addInsight} label="Add Insight" />
      </div>

      {insights.length === 0 && (
        <EmptyState message="No insights yet. Click 'Add Insight' to begin." />
      )}

      <div className="space-y-3">
        {insights.map((ins, i) => (
          <div
            key={i}
            className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">
                Insight #{i + 1}
              </span>
              <button
                onClick={() => removeInsight(i)}
                className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
              >
                Remove
              </button>
            </div>
            <input
              placeholder="Title (e.g. IPL Legend)"
              value={ins.title}
              onChange={(e) => updateInsight(i, "title", e.target.value)}
              className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <textarea
              placeholder="Description..."
              value={ins.description}
              onChange={(e) => updateInsight(i, "description", e.target.value)}
              rows={3}
              className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>
        ))}
      </div>

      <Divider />

      {/* ── Strengths ── */}
      <div className="flex items-center justify-between">
        <SectionTitle title="Strengths" noMargin />
        <AddButton onClick={addStrength} label="Add Strength" />
      </div>

      {strengths.length === 0 && (
        <EmptyState message="No strengths yet. Click 'Add Strength' to begin." />
      )}

      <div className="space-y-2">
        {strengths.map((s, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-gray-600 text-sm w-5 shrink-0">{i + 1}.</span>
            <input
              placeholder={`Strength #${i + 1} (e.g. Exceptional consistency)`}
              value={s}
              onChange={(e) => updateStrength(i, e.target.value)}
              className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              onClick={() => removeStrength(i)}
              className="text-red-400 hover:text-red-300 text-lg px-2 shrink-0 transition-colors"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <FormActions
        onSave={handleSubmit}
        onCancel={onBack}
        loading={loading}
        isEdit={!!insightsDocId}
        saveLabel="Save & Continue →"
        cancelLabel="← Back"
      />
    </div>
  );
}