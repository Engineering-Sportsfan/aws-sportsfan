"use client";

import axios from "axios";
import Link from "next/link";
import { useState } from "react";
import { Loader2, ArrowLeft, Zap } from "lucide-react";

const SPORT_OPTIONS = [
  { value: "track_field", label: "Track & Field" },
  { value: "cricket", label: "Cricket" },
  { value: "badminton", label: "Badminton" },
];

export default function AddAthletePage() {
  const [athleteId, setAthleteId] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [sport, setSport] = useState(SPORT_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!athleteId.trim() || !athleteName.trim() || !sport) {
      setError("Athlete ID, athlete name, and sport are all required.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await axios.post("/api/admin/athlete-pipeline/run", {
        athlete_id: athleteId.trim(),
        athlete_name: athleteName.trim(),
        sport,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to trigger pipeline run.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 text-white">
      <Link
        href="/admin/athlete-review-management"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition mb-6"
      >
        <ArrowLeft size={14} />
        Back to Review Queue
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold">Add / Re-check Athlete</h1>
        <p className="text-sm text-gray-400 mt-1">
          Fetches the athlete from its licensed source, runs Gemini extraction, and
          queues the result for review. Nothing is published live from here — approve
          or reject the resulting draft from the Review Queue.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 flex flex-col gap-5"
      >
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Athlete ID <span className="text-pink-500">*</span>
          </label>
          <input
            type="text"
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            placeholder="e.g. neeraj-chopra"
            className="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-pink-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            The document ID this athlete will use (or already uses) in the live athletesProfile collection.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Athlete Name <span className="text-pink-500">*</span>
          </label>
          <input
            type="text"
            value={athleteName}
            onChange={(e) => setAthleteName(e.target.value)}
            placeholder="e.g. Neeraj Chopra"
            className="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-pink-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used to search the licensed source (e.g. World Athletics).
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Sport <span className="text-pink-500">*</span>
          </label>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
          >
            {SPORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Cricket and Badminton are stubbed until a licensed source is confirmed for them —
            the run will return an error until then.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1.5">Pipeline result</p>
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
            {result.status === "queued" && (
              <Link
                href="/admin/athlete-review-management"
                className="inline-block mt-3 text-xs text-pink-400 hover:underline"
              >
                View in Review Queue →
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:opacity-90 active:scale-[0.98] transition text-white font-medium rounded-lg text-sm disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Fetching & extracting...
            </>
          ) : (
            <>
              <Zap size={16} />
              Run Pipeline
            </>
          )}
        </button>
      </form>
    </div>
  );
}