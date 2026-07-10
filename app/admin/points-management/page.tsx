"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Search, Save, CheckCircle, AlertTriangle, Trash2, Plus, ArrowUpDown } from "lucide-react";

interface PointRule {
  id: string;
  name: string;
  points: number;
  dailyLimit: number;
  status: "active" | "inactive" | "suspended";
  updatedAt?: number;
}

export default function PointsManagementPage() {
  const [rules, setRules] = useState<PointRule[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // New Rule Form State (CRUD - Create)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRuleId, setNewRuleId] = useState("");
  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePoints, setNewRulePoints] = useState(10);
  const [newRuleLimit, setNewRuleLimit] = useState(5);
  const [newRuleStatus, setNewRuleStatus] = useState<"active" | "inactive" | "suspended">("active");
  const [creating, setCreating] = useState(false);

  // Configurable Streak settings (Spec review #4)
  const [minSessionSeconds, setMinSessionSeconds] = useState(60);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchRules();
    fetchStreakSettings();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await axios.get("/api/admin/point-rules");
      if (res.data.success) {
        setRules(res.data.rules);
      }
    } catch (err) {
      console.error("Failed to load point rules:", err);
      showFeedback("error", "Failed to load point rules from the database.");
    } finally {
      setLoading(false);
    }
  };

  const fetchStreakSettings = async () => {
    try {
      const res = await axios.get("/api/admin/streak-settings");
      if (res.data.success) {
        setMinSessionSeconds(res.data.minSessionSeconds);
      }
    } catch (err) {
      console.error("Failed to load streak settings:", err);
    }
  };

  const handleUpdateRule = async (ruleId: string, points: number, dailyLimit: number, status: string) => {
    setUpdatingId(ruleId);
    setFeedback(null);
    try {
      const res = await axios.post("/api/admin/point-rules", {
        ruleId,
        points: Number(points),
        dailyLimit: Number(dailyLimit),
        status,
      });

      if (res.data.success) {
        showFeedback("success", `Rule ${ruleId} updated successfully.`);
        fetchRules();
      }
    } catch (err: any) {
      console.error("Error updating rule:", err);
      const errMsg = err.response?.data?.error || "Error writing to database.";
      showFeedback("error", errMsg);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleId || !newRuleName) {
      showFeedback("error", "Rule ID and Name are required.");
      return;
    }
    setCreating(true);
    setFeedback(null);
    try {
      const res = await axios.post("/api/admin/point-rules", {
        ruleId: newRuleId.toUpperCase().replace(/\s+/g, "_"),
        points: Number(newRulePoints),
        dailyLimit: Number(newRuleLimit),
        status: newRuleStatus,
      });

      if (res.data.success) {
        showFeedback("success", `Rule ${newRuleId} created successfully.`);
        // Reset form
        setNewRuleId("");
        setNewRuleName("");
        setNewRulePoints(10);
        setNewRuleLimit(5);
        setShowCreateForm(false);
        fetchRules();
      }
    } catch (err: any) {
      console.error("Error creating rule:", err);
      const errMsg = err.response?.data?.error || "Error creating rule in database.";
      showFeedback("error", errMsg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm(`Are you sure you want to delete the rule: ${ruleId}?`)) return;
    setDeletingId(ruleId);
    setFeedback(null);
    try {
      const res = await axios.delete(`/api/admin/point-rules?ruleId=${ruleId}`);
      if (res.data.success) {
        showFeedback("success", `Rule ${ruleId} deleted successfully.`);
        fetchRules();
      }
    } catch (err: any) {
      console.error("Error deleting rule:", err);
      const errMsg = err.response?.data?.error || "Error deleting rule from database.";
      showFeedback("error", errMsg);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveStreakSettings = async () => {
    setSavingSettings(true);
    setFeedback(null);
    try {
      const res = await axios.post("/api/admin/streak-settings", {
        minSessionSeconds: Number(minSessionSeconds)
      });
      if (res.data.success) {
        showFeedback("success", "Active streak session settings updated successfully.");
      }
    } catch (err: any) {
      console.error("Error saving streak settings:", err);
      showFeedback("error", "Error saving settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const filteredRules = rules.filter(rule => 
    (rule.name || rule.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
    rule.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          Loading points engine configurations...
        </div>
      </div>
    );
  }

  return (
    <div className="p-1 space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Points & Rules Management</h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage real-time points configurations, toggle rules lifecycle, enforce limits, and adjust active session durations.
        </p>
      </div>

      {/* Notification Banner */}
      {feedback && (
        <div className={`p-4 rounded-lg flex items-center gap-3 transition-all duration-300 ${
          feedback.type === "success" 
            ? "bg-emerald-950/40 border border-emerald-800 text-emerald-300" 
            : "bg-red-950/40 border border-red-800 text-red-300"
        }`}>
          <CheckCircle size={18} />
          <span className="text-sm font-medium">{feedback.message}</span>
        </div>
      )}

      {/* Streak Session Duration Settings Panel (Spec Review #4) */}
      <div className="bg-[#161b22] border border-[#21282f] rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-[#21282f] pb-3">
          <h2 className="text-md font-semibold text-white">Global Streak Settings</h2>
          <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-950/50 px-2.5 py-1 rounded-md border border-blue-900/60">Configurable</span>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex flex-col space-y-1.5 w-full sm:w-auto">
            <label className="text-xs text-gray-400 font-medium">Minimum Active Session Duration (Seconds)</label>
            <input
              type="number"
              value={minSessionSeconds}
              onChange={(e) => setMinSessionSeconds(Number(e.target.value))}
              className="w-full sm:w-48 bg-[#0d1117] border border-[#21282f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleSaveStreakSettings}
            disabled={savingSettings}
            className="w-full sm:w-auto mt-0 sm:mt-5 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {savingSettings ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <Save size={14} />
            )}
            Save Global Settings
          </button>
        </div>
      </div>

      {/* Create New Rule Form (CRUD - Create) */}
      {showCreateForm ? (
        <form onSubmit={handleCreateRule} className="bg-[#161b22] border border-[#21282f] rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-[#21282f] pb-3">
            <h2 className="text-md font-semibold text-white">Create New Point Rule</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="flex flex-col space-y-1">
              <label className="text-xs text-gray-400">Rule ID / Key (e.g. POST_VIRAL)</label>
              <input
                type="text"
                placeholder="RULE_KEY"
                value={newRuleId}
                onChange={(e) => setNewRuleId(e.target.value)}
                className="bg-[#0d1117] border border-[#21282f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="text-xs text-gray-400">Display Name</label>
              <input
                type="text"
                placeholder="Rule Name"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                className="bg-[#0d1117] border border-[#21282f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="text-xs text-gray-400">Base Points</label>
              <input
                type="number"
                value={newRulePoints}
                onChange={(e) => setNewRulePoints(Number(e.target.value))}
                className="bg-[#0d1117] border border-[#21282f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="text-xs text-gray-400">Daily Limit</label>
              <input
                type="number"
                value={newRuleLimit}
                onChange={(e) => setNewRuleLimit(Number(e.target.value))}
                className="bg-[#0d1117] border border-[#21282f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="text-xs text-gray-400">Status</label>
              <select
                value={newRuleStatus}
                onChange={(e) => setNewRuleStatus(e.target.value as any)}
                className="bg-[#0d1117] border border-[#21282f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {creating ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <Plus size={14} />
              )}
              Add Rule
            </button>
          </div>
        </form>
      ) : null}

      {/* Toolbar Search & Add Button */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#21282f] rounded-lg py-2 pl-9 pr-4 text-sm text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-500"
          />
          <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus size={14} />
            Create Custom Rule
          </button>
        )}
      </div>

      {/* Rules Table */}
      <div className="bg-[#161b22] border border-[#21282f] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-[#1c2330] border-b border-[#21282f]">
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Rule Name / ID</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-400 w-28">Base Points</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-400 w-28">Daily Limit</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-400 w-36">Status</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-400 w-44 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="border-b border-[#21282f] hover:bg-[#1f242c]/30 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-white text-sm">{rule.name || rule.id.replace(/_/g, " ")}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">{rule.id}</div>
                  </td>
                  <td className="p-4">
                    <input
                      type="number"
                      defaultValue={rule.points}
                      id={`points-${rule.id}`}
                      className="w-20 bg-[#0d1117] border border-[#21282f] rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      type="number"
                      defaultValue={rule.dailyLimit}
                      id={`limit-${rule.id}`}
                      className="w-20 bg-[#0d1117] border border-[#21282f] rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="p-4">
                    <select
                      defaultValue={rule.status}
                      id={`status-${rule.id}`}
                      className={`bg-[#0d1117] border border-[#21282f] rounded-md px-2 py-1 text-sm font-medium focus:outline-none ${
                        rule.status === "active" 
                          ? "text-emerald-400" 
                          : rule.status === "suspended" 
                          ? "text-amber-400" 
                          : "text-red-400"
                      }`}
                      onChange={(e) => {
                        const el = e.target;
                        el.className = `bg-[#0d1117] border border-[#21282f] rounded-md px-2 py-1 text-sm font-medium focus:outline-none ${
                          el.value === "active" 
                            ? "text-emerald-400" 
                            : el.value === "suspended" 
                            ? "text-amber-400" 
                            : "text-red-400"
                        }`;
                      }}
                    >
                      <option value="active" className="text-emerald-400 bg-[#0d1117]">Active</option>
                      <option value="suspended" className="text-amber-400 bg-[#0d1117]">Suspended</option>
                      <option value="inactive" className="text-red-400 bg-[#0d1117]">Inactive</option>
                    </select>
                  </td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    <button
                      onClick={() => {
                        const pts = (document.getElementById(`points-${rule.id}`) as HTMLInputElement)?.value;
                        const lim = (document.getElementById(`limit-${rule.id}`) as HTMLInputElement)?.value;
                        const stat = (document.getElementById(`status-${rule.id}`) as HTMLSelectElement)?.value;
                        handleUpdateRule(rule.id, Number(pts), Number(lim), stat);
                      }}
                      disabled={updatingId === rule.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {updatingId === rule.id ? (
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <Save size={12} />
                      )}
                      Save
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      disabled={deletingId === rule.id}
                      className="inline-flex items-center justify-center p-1.5 bg-red-950/40 border border-red-900/60 hover:bg-red-900 hover:text-white text-red-400 rounded-md transition-colors"
                      title="Delete Rule"
                    >
                      {deletingId === rule.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
