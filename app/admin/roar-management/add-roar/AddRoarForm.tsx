"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function AddRoarForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('⚽');
  const [sport, setSport] = useState('cricket');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [scheduledStartTime, setScheduledStartTime] = useState('');
  const [score, setScore] = useState('');
  const [scoreSubtitle, setScoreSubtitle] = useState('');
  const [createWatchAlong, setCreateWatchAlong] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [matches, setMatches] = useState<{ id: string; team_a: string; team_b: string; sport: string }[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');

  useEffect(() => {
    async function loadMatches() {
      try {
        const response = await fetch('/api/roar/matches');
        const resData = await response.json();
        if (response.ok) {
          // Filter to only upcoming or live matches
          const activeMatches = (resData.matches || []).filter(
            (m: any) => m.status === "upcoming" || m.status === "live"
          );
          setMatches(activeMatches);
        }
      } catch (err) {
        console.error("Failed to load matches list", err);
      }
    }
    loadMatches();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const scheduledTimeMs = scheduledStartTime ? new Date(scheduledStartTime).getTime() : undefined;
      await axios.post('/api/roar/rooms', {
        name: name.trim(),
        icon,
        sport,
        description: description.trim(),
        isActive,
        scheduledStartTime: scheduledTimeMs,
        score: score.trim(),
        scoreSubtitle: scoreSubtitle.trim(),
        createWatchAlong,
        matchId: selectedMatchId || undefined,
      });
      if (createWatchAlong) {
        router.push('/admin/watchalong-management/watchalong-list');
      } else {
        router.push('/admin/roar-management/roar-list');
      }
    } catch (error: any) {
      console.error('Failed to create show', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      alert('Failed to create show: ' + errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const icons = ['⚽', '🏏', '🏀', '🏆', '📣', '🔥', '🌍', '💫'];

  return (
    <div className="max-w-[800px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Create RoAR Show Room</h1>
        <p className="text-sm text-gray-400">Launch a new dynamic live chat room for fans</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-[#161b22] border border-[#21262d] rounded-lg p-6">
        {/* Name input */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Show Title / Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. FIFA Discussion, World Cup Chat Room"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Sport Category Select */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Sport Category
          </label>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="cricket">Cricket 🏏</option>
            <option value="football">Football ⚽</option>
          </select>
        </div>

        {/* Link to Focus Match (Optional Dropdown) */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Link to Focus Group Match (Optional)
          </label>
          <select
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">-- No Match Linked (Normal Fallback Mode) --</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.sport === "cricket" ? "🏏" : "⚽"} {m.team_a} vs {m.team_b} ({m.sport.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        {/* Description Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Description / Event Details
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. 3rd Test · Day 2 · Adelaide Oval"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Score Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Match Score (Optional)
          </label>
          <input
            type="text"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="e.g. 287/4"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Score Subtitle Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Score Subtitle (Optional)
          </label>
          <input
            type="text"
            value={scoreSubtitle}
            onChange={(e) => setScoreSubtitle(e.target.value)}
            placeholder="e.g. IND • 88 ov"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Scheduled Start Time Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Scheduled Start Time (Optional)
          </label>
          <input
            type="datetime-local"
            value={scheduledStartTime}
            onChange={(e) => setScheduledStartTime(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Sync Watchalong commentary room toggle */}
        <div className="flex items-center gap-3 bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
          <input
            type="checkbox"
            id="createWatchAlong"
            checked={createWatchAlong}
            onChange={(e) => setCreateWatchAlong(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 border-[#30363d] focus:ring-blue-500 bg-[#161b22] cursor-pointer"
          />
          <label htmlFor="createWatchAlong" className="text-sm font-semibold text-gray-300 cursor-pointer select-none">
            Create as Watchalong Room (Audio/Video Support)
          </label>
        </div>

        {/* Room Status Toggle */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Room Status
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsActive(true)}
              className={`px-4 py-2 rounded-lg border text-sm font-semibold transition ${
                isActive
                  ? 'border-green-500 bg-green-500/10 text-green-400'
                  : 'border-[#30363d] bg-[#0d1117] text-gray-400 hover:border-gray-500'
              }`}
            >
              Active / Open
            </button>
            <button
              type="button"
              onClick={() => setIsActive(false)}
              className={`px-4 py-2 rounded-lg border text-sm font-semibold transition ${
                !isActive
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : 'border-[#30363d] bg-[#0d1117] text-gray-400 hover:border-gray-500'
              }`}
            >
              Closed / Inactive
            </button>
          </div>
        </div>

        {/* Preset Icons Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Show Icon
          </label>
          <div className="flex gap-3 flex-wrap">
            {icons.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setIcon(item)}
                className={`w-12 h-12 text-2xl flex items-center justify-center rounded-lg border transition ${
                  icon === item
                    ? 'border-blue-500 bg-blue-600/10'
                    : 'border-[#30363d] bg-[#0d1117] hover:border-gray-500'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4 pt-4 border-t border-[#21262d]">
          <button
            type="button"
            onClick={() => router.push('/admin/roar-management/roar-list')}
            className="px-6 py-2.5 rounded-lg border border-[#30363d] bg-transparent text-sm text-white hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-6 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
          >
            {saving ? 'Creating Room...' : 'Create Show Room'}
          </button>
        </div>
      </form>
    </div>
  );
}
