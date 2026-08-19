"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Plus, Check, X, Pencil, Loader2, Clock } from "lucide-react";

type ReviewStatus = "pending" | "approved" | "rejected";

interface ReviewDraftSummary {
  id: string;
  athleteId: string;
  athleteName: string;
  sport: string;
  triggerReason: string;
  status: ReviewStatus;
  createdAt: string;
}

interface ReviewDraftDetail extends ReviewDraftSummary {
  proposedFields: Record<string, unknown>;
  currentFields: Record<string, unknown>;
  sourceUrls: string[];
}

export default function AthleteReviewManagementPage() {
  const [statusFilter, setStatusFilter] = useState<ReviewStatus>("pending");
  const [drafts, setDrafts] = useState<ReviewDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<ReviewDraftDetail | null>(null);
  const [fetchingDetail, setFetchingDetail] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<string>("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    fetchDrafts();
  }, [statusFilter]);

  const fetchDrafts = async () => {
    try {
      setLoading(true);
      setSelected(null);
      const res = await axios.get(`/api/admin/athlete-review?status=${statusFilter}`);
      setDrafts(res.data?.drafts ?? res.data ?? []);
    } catch (error) {
      console.error("Failed to fetch review queue", error);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (id: string) => {
    try {
      setFetchingDetail(id);
      const res = await axios.get(`/api/admin/athlete-review/${id}`);
      setSelected(res.data);
      setEditedFields(JSON.stringify(res.data?.proposedFields ?? {}, null, 2));
    } catch (error) {
      console.error("Failed to fetch draft detail", error);
      alert("Failed to load draft.");
    } finally {
      setFetchingDetail(null);
    }
  };

  const handleResolve = async (action: "approve" | "edit" | "reject") => {
    if (!selected) return;

    let reason: string | null = "";
    if (action === "reject") {
      reason = prompt("Reason for rejection:");
      if (reason === null) return;
    }

    let fields: Record<string, unknown> | undefined;
    if (action === "edit") {
      try {
        fields = JSON.parse(editedFields);
      } catch {
        alert("Edited fields must be valid JSON.");
        return;
      }
    }

    if (
      !confirm(
        action === "approve"
          ? "Publish this draft to the live athlete profile as-is?"
          : action === "edit"
          ? "Publish your edited values to the live athlete profile?"
          : "Reject this draft?"
      )
    ) {
      return;
    }

    try {
      setResolving(true);
      await axios.post(`/api/admin/athlete-review/${selected.id}/resolve`, {
        action,
        fields,
        reason: reason || undefined,
      });
      alert("Done.");
      setSelected(null);
      fetchDrafts();
    } catch (error: any) {
      console.error("Failed to resolve draft", error);
      alert(error?.response?.data?.error || "Failed to resolve draft.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Athlete AI Pipeline — Review Queue</h1>
          <p className="text-sm text-gray-400">
            AI-drafted athlete profile changes await approval here before publishing live.
          </p>
        </div>
        <Link
          href="/admin/athlete-review-management/add-athlete"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:opacity-90 active:scale-[0.98] transition text-white font-medium rounded-lg text-sm"
        >
          <Plus size={16} />
          Add / Re-check Athlete
        </Link>
      </div>

      {/* STATUS TABS */}
      <div className="flex border-b border-[#21262d] gap-2 mb-6">
        {(["pending", "approved", "rejected"] as ReviewStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition capitalize ${
              statusFilter === status
                ? "border-pink-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QUEUE LIST */}
        <div className="lg:col-span-2 bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden h-fit">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-[#1c2330] border-b border-[#21262d]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Athlete</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Trigger</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Queued</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto"></div>
                      <p className="mt-2">Loading review queue...</p>
                    </td>
                  </tr>
                ) : drafts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">
                      No {statusFilter} drafts.
                    </td>
                  </tr>
                ) : (
                  drafts.map((draft) => (
                    <tr key={draft.id} className="border-b border-[#21262d] hover:bg-[#0d1117] transition">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{draft.athleteName}</span>
                          <span className="text-xs text-gray-500">{draft.sport}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">{draft.triggerReason}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(draft.createdAt).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleView(draft.id)}
                          disabled={fetchingDetail === draft.id}
                          className="p-2 rounded-md bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition disabled:opacity-50"
                          title="Review draft"
                        >
                          {fetchingDetail === draft.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DRAFT INSPECTOR */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5 flex flex-col min-h-[400px]">
          <h2 className="text-base font-semibold border-b border-[#21262d] pb-3 mb-4">
            Draft Inspector
          </h2>

          {selected ? (
            <div className="flex flex-col flex-1">
              <div className="mb-3">
                <p className="text-sm font-medium text-white">{selected.athleteName}</p>
                <p className="text-xs text-gray-500">Trigger: {selected.triggerReason}</p>
                {selected.sourceUrls?.length > 0 && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {selected.sourceUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-pink-400 hover:underline truncate"
                      >
                        {url}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <label className="text-xs text-gray-400 mb-1">Proposed fields (editable JSON)</label>
              <textarea
                value={editedFields}
                onChange={(e) => setEditedFields(e.target.value)}
                disabled={selected.status !== "pending"}
                className="flex-1 min-h-[220px] bg-[#0d1117] border border-[#21262d] rounded-lg p-3 text-xs text-gray-300 font-mono resize-none disabled:opacity-60"
              />

              {selected.status === "pending" && (
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleResolve("approve")}
                    disabled={resolving}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition text-xs font-semibold rounded-md disabled:opacity-50"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    onClick={() => handleResolve("edit")}
                    disabled={resolving}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition text-xs font-semibold rounded-md disabled:opacity-50"
                  >
                    <Pencil size={14} /> Save Edits
                  </button>
                  <button
                    onClick={() => handleResolve("reject")}
                    disabled={resolving}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition text-xs font-semibold rounded-md disabled:opacity-50"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 border border-dashed border-[#21262d] rounded-lg flex flex-col items-center justify-center text-center p-6 text-gray-500">
              <Eye size={40} className="mb-2 text-gray-600" />
              <p className="text-sm">Select a draft to review proposed vs current values</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}