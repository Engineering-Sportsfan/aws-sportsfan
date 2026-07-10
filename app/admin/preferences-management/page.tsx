"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Eye, Trash2, CheckCircle, XCircle, User, Activity, ListFilter } from "lucide-react";

type NotificationPreferences = {
  liveMatchAlerts: boolean;
  finalScores: boolean;
  breakingNews: boolean;
  highlightDrops: boolean;
};

type UserPreferences = {
  id: string;
  userId: string;
  purpose: string;
  sports: string[];
  contentStyle: string;
  notifications: NotificationPreferences;
  createdAt: number;
  updatedAt: number;
};

export default function PreferencesManagementPage() {
  const [preferences, setPreferences] = useState<UserPreferences[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPref, setSelectedPref] = useState<UserPreferences | null>(null);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/preferences");
      if (res.data.success) {
        setPreferences(res.data.preferences);
      }
    } catch (error) {
      console.error("Failed to fetch preferences", error);
    } finally {
      setLoading(false);
    }
  };

  const deletePreference = async (userId: string) => {
    if (!confirm("Delete this preference record?")) return;
    
    try {
      await axios.delete(`/api/preferences?userId=${userId}`);
      fetchPreferences();
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete preference");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatEnumValue = (value: string) => {
    return value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="max-w-[1440px] mx-auto text-white">
      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">User Preferences</h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage sports and content preferences submitted by users.
        </p>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400 flex items-center gap-2"><Activity size={14}/> Total Profiles</p>
          <p className="text-2xl font-bold text-white mt-1">{preferences.length}</p>
        </div>
      </div>

      {/* PREFERENCES TABLE */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">User ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Purpose</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Sports</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Content Style</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Created At</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4">Loading preferences...</p>
                  </td>
                </tr>
              ) : preferences.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    <ListFilter className="mx-auto mb-2 opacity-50" size={32} />
                    <p>No preferences found.</p>
                  </td>
                </tr>
              ) : (
                preferences.map((pref) => (
                  <tr key={pref.id} className="border-b border-[#21262d] hover:bg-[#0d1117] transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <User size={14} className="text-blue-400" />
                        </div>
                        <div>
                          <span className="font-medium text-white text-sm block">{pref.userId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs rounded-md bg-[#21262d] text-gray-300">
                        {formatEnumValue(pref.purpose)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {pref.sports.slice(0, 2).map((sport, idx) => (
                          <span key={idx} className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                            {sport}
                          </span>
                        ))}
                        {pref.sports.length > 2 && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-800 text-gray-400">
                            +{pref.sports.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300">{formatEnumValue(pref.contentStyle)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-400">{formatDate(pref.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedPref(pref)}
                          className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => deletePreference(pref.userId)}
                          className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILS MODAL */}
      {selectedPref && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedPref(null)}>
          <div className="bg-[#161b22] rounded-xl max-w-lg w-full p-6 border border-[#21262d]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                <User size={18} className="text-blue-400"/> Preference Details
              </h3>
              <button onClick={() => setSelectedPref(null)} className="text-gray-400 hover:text-white transition">
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">User ID</p>
                <p className="text-white font-medium bg-[#0d1117] px-3 py-2 rounded-md border border-[#21262d]">
                  {selectedPref.userId}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Purpose</p>
                  <p className="text-gray-300 text-sm">{formatEnumValue(selectedPref.purpose)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Content Style</p>
                  <p className="text-gray-300 text-sm">{formatEnumValue(selectedPref.contentStyle)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Favorite Sports</p>
                <div className="flex flex-wrap gap-2">
                  {selectedPref.sports.map((sport, idx) => (
                    <span key={idx} className="px-3 py-1 text-sm rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {sport}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Notifications</p>
                <div className="bg-[#0d1117] rounded-lg border border-[#21262d] p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Live Match Alerts</span>
                    {selectedPref.notifications.liveMatchAlerts ? <CheckCircle size={16} className="text-green-500"/> : <XCircle size={16} className="text-gray-600"/>}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Final Scores</span>
                    {selectedPref.notifications.finalScores ? <CheckCircle size={16} className="text-green-500"/> : <XCircle size={16} className="text-gray-600"/>}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Breaking News</span>
                    {selectedPref.notifications.breakingNews ? <CheckCircle size={16} className="text-green-500"/> : <XCircle size={16} className="text-gray-600"/>}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Highlight Drops</span>
                    {selectedPref.notifications.highlightDrops ? <CheckCircle size={16} className="text-green-500"/> : <XCircle size={16} className="text-gray-600"/>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#21262d]">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Created At</p>
                  <p className="text-gray-300 text-xs">{formatDate(selectedPref.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Updated At</p>
                  <p className="text-gray-300 text-xs">{formatDate(selectedPref.updatedAt)}</p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
