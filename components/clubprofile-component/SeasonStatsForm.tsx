"use client";

import axios from "axios";
import { ChangeEvent, useState } from "react";
import {
  SeasonForm,
  Input,
  SectionTitle,
  Divider,
  FormActions,
} from "./shared";

//  PROPS 

type Props = {
  clubProfileId: string;
  seasonDocId?: string;
  initialForm?: SeasonForm;
  onSaved: (seasonDocId: string) => void;
  onBack: () => void;
};

//  DEFAULT FORM 

export const defaultSeasonForm: SeasonForm = {
  year: "",
  wins: "",
  losses: "",
  points: "",
  position: "",
  matchesPlayed: "",
  netRunRate: "",
  highestTotal: "",
  lowestTotal: "",
  runs: "",
  strikeRate: "",
  average: "",
  fifties: "",
  hundreds: "",
  highestScore: "",
  fours: "",
  sixes: "",
  award: "",
  awardSub: "",
};

// ─── COMPONENT ─────────────────────────────────────────────────────────────────

export default function SeasonStatsForm({
  clubProfileId,
  seasonDocId,
  initialForm = defaultSeasonForm,
  onSaved,
  onBack,
}: Props) {
  const [form, setForm] = useState<SeasonForm>(initialForm);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!form.year) {
      alert("Season year is required");
      return;
    }
    setLoading(true);
    try {
      const payload = { clubProfileId, season: form };
      let res;
      if (seasonDocId) {
        res = await axios.put(`/api/club-profile/season/${seasonDocId}`, payload);
        onSaved(seasonDocId);
      } else {
        res = await axios.post("/api/club-profile/season", payload);
        onSaved(res.data.seasonStats.id);
      }
      if (res.data.success) {
        alert(seasonDocId ? "Season updated!" : "Season created!");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving season");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
      {/* Season Overview */}
      <SectionTitle title="Season Overview" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Year *"
          name="year"
          value={form.year}
          onChange={handleChange}
          placeholder="e.g. 2025"
        />
        <Input
          label="Wins"
          name="wins"
          value={form.wins}
          onChange={handleChange}
          placeholder="e.g. 12"
        />
        <Input
          label="Losses"
          name="losses"
          value={form.losses}
          onChange={handleChange}
          placeholder="e.g. 6"
        />
        <Input
          label="Points"
          name="points"
          value={form.points}
          onChange={handleChange}
          placeholder="e.g. 24"
        />
        <Input
          label="Position"
          name="position"
          value={form.position}
          onChange={handleChange}
          placeholder="e.g. 2nd"
        />
        <Input
          label="Matches Played"
          name="matchesPlayed"
          value={form.matchesPlayed}
          onChange={handleChange}
          placeholder="e.g. 18"
        />
        <Input
          label="Net Run Rate"
          name="netRunRate"
          value={form.netRunRate}
          onChange={handleChange}
          placeholder="e.g. +0.85"
        />
        <Input
          label="Highest Total"
          name="highestTotal"
          value={form.highestTotal}
          onChange={handleChange}
          placeholder="e.g. 200/3"
        />
        <Input
          label="Lowest Total"
          name="lowestTotal"
          value={form.lowestTotal}
          onChange={handleChange}
          placeholder="e.g. 120/10"
        />
      </div>

      <Divider />

      {/* Batting Stats */}
      <SectionTitle title="Batting Stats" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Runs"
          name="runs"
          value={form.runs}
          onChange={handleChange}
          placeholder="e.g. 741"
        />
        <Input
          label="Strike Rate"
          name="strikeRate"
          value={form.strikeRate}
          onChange={handleChange}
          placeholder="e.g. 154.70"
        />
        <Input
          label="Average"
          name="average"
          value={form.average}
          onChange={handleChange}
          placeholder="e.g. 38.99"
        />
        <Input
          label="Fifties"
          name="fifties"
          value={form.fifties}
          onChange={handleChange}
          placeholder="e.g. 4"
        />
        <Input
          label="Hundreds"
          name="hundreds"
          value={form.hundreds}
          onChange={handleChange}
          placeholder="e.g. 1"
        />
        <Input
          label="Highest Score"
          name="highestScore"
          value={form.highestScore}
          onChange={handleChange}
          placeholder="e.g. 113*"
        />
        <Input
          label="Fours"
          name="fours"
          value={form.fours}
          onChange={handleChange}
          placeholder="e.g. 64"
        />
        <Input
          label="Sixes"
          name="sixes"
          value={form.sixes}
          onChange={handleChange}
          placeholder="e.g. 38"
        />
      </div>

      <Divider />

      {/* Award */}
      <SectionTitle title="Award" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Award Title"
          name="award"
          value={form.award}
          onChange={handleChange}
          placeholder="e.g. Orange Cap Winner"
        />
        <Input
          label="Award Subtitle"
          name="awardSub"
          value={form.awardSub}
          onChange={handleChange}
          placeholder="e.g. Most runs in IPL 2024"
        />
      </div>

      <FormActions
        onSave={handleSubmit}
        onCancel={onBack}
        loading={loading}
        isEdit={!!seasonDocId}
        saveLabel="Save & Continue →"
        cancelLabel="← Back"
      />
    </div>
  );
}