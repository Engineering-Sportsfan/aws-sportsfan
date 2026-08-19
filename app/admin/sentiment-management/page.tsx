"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Eye, FileJson, Calendar, Play, Download, Loader2 } from "lucide-react";

const API_BASE_URL = "https://sportsfan360-sentiment.onrender.com";

export default function SentimentManagementPage() {
  const [sport, setSport] = useState<"FIFA_WC_2026" | "WT20W_WC_2026">("FIFA_WC_2026");
  const [reports, setReports] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [fetchingReport, setFetchingReport] = useState<string | null>(null);

  useEffect(() => {
    fetchReportList();
  }, [sport]);

  const fetchReportList = async () => {
    try {
      setLoading(true);
      setSelectedReport(null);
      const res = await axios.get(`${API_BASE_URL}/list-reports?sport=${sport}`);
      if (res.data && res.data.reports) {
        setReports(res.data.reports);
      } else {
        setReports([]);
      }
    } catch (error) {
      console.error("Failed to fetch reports list", error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRunNow = async () => {
    if (!confirm(`Are you sure you want to trigger a new sentiment scan for ${sport === "FIFA_WC_2026" ? "FIFA WC 2026" : "Women's T20 WC 2026"}? This will search the live internet and can take up to 45 seconds.`)) {
      return;
    }

    try {
      setRunning(true);
      const res = await axios.post(`${API_BASE_URL}/run-now?sport=${sport}`);
      if (res.data && res.data.status === "success") {
        alert(`Success! Report successfully generated and saved as: ${res.data.saved_as}`);
        fetchReportList();
      } else {
        alert("Pipeline finished but failed to generate/save report. Check Render logs.");
      }
    } catch (error) {
      console.error("Failed to run sentiment pipeline", error);
      alert("Error triggering run. The server might be sleeping, please try again in a moment.");
    } finally {
      setRunning(false);
    }
  };

  const handleViewReport = async (timestamp: string) => {
    try {
      setFetchingReport(timestamp);
      const res = await axios.get(`${API_BASE_URL}/get-report?sport=${sport}&timestamp=${timestamp}`);
      if (res.data) {
        setSelectedReport(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch report details", error);
      alert("Failed to load report data.");
    } finally {
      setFetchingReport(null);
    }
  };

  const handleDownloadJSON = (reportData: any) => {
    const filename = `sportsfan360-sentiment-${sport}-${reportData.timestamp || "report"}.json`;
    const jsonStr = JSON.stringify(reportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestampStr: string) => {
    // Converts YYYY-MM-DD_HH-MM-SS to YYYY-MM-DD HH:MM:SS
    return timestampStr.replace("_", " ").replace(/-/g, "/").slice(0, 19);
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Sentiment Engine Automation</h1>
          <p className="text-sm text-gray-400">
            Monitor and download daily fan sentiments processed by Gemini & Vertex AI
          </p>
        </div>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:opacity-90 active:scale-[0.98] transition text-white font-medium rounded-lg text-sm disabled:opacity-50"
        >
          {running ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Scanning Web... (40s)
            </>
          ) : (
            <>
              <Play size={16} fill="white" />
              Run Scan Now
            </>
          )}
        </button>
      </div>

      {/* SPORT SELECTION TABS */}
      <div className="flex border-b border-[#21262d] gap-2 mb-6">
        <button
          onClick={() => setSport("FIFA_WC_2026")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            sport === "FIFA_WC_2026"
              ? "border-pink-500 text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          FIFA World Cup 2026
        </button>
        <button
          onClick={() => setSport("WT20W_WC_2026")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            sport === "WT20W_WC_2026"
              ? "border-pink-500 text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          WT20 Women's WC
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* REPORTS LIST TABLE */}
        <div className="lg:col-span-2 bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden h-fit">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-[#1c2330] border-b border-[#21262d]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 w-12">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Report Date & ID</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-gray-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto"></div>
                      <p className="mt-2">Loading reports...</p>
                    </td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-gray-400">
                      No reports found in Firebase
                    </td>
                  </tr>
                ) : (
                  reports.map((timestamp, index) => (
                    <tr key={timestamp} className="border-b border-[#21262d] hover:bg-[#0d1117] transition">
                      <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
                            <FileJson size={16} className="text-pink-500" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-white">{timestamp}</span>
                            <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <Calendar size={12} />
                              {formatTimestamp(timestamp)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewReport(timestamp)}
                            disabled={fetchingReport === timestamp}
                            className="p-2 rounded-md bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition disabled:opacity-50"
                            title="Inspect JSON"
                          >
                            {fetchingReport === timestamp ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Eye size={16} />
                            )}
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

        {/* REPORT INSPECTOR */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5 flex flex-col min-h-[400px]">
          <h2 className="text-base font-semibold border-b border-[#21262d] pb-3 mb-4">
            JSON Viewer & Downloader
          </h2>

          {selectedReport ? (
            <div className="flex flex-col flex-1">
              <div className="flex justify-between items-center bg-[#1c2330] p-3 rounded-lg border border-[#21262d] mb-4">
                <span className="text-xs text-gray-400 font-mono">
                  {selectedReport.timestamp}.json
                </span>
                <button
                  onClick={() => handleDownloadJSON(selectedReport)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition text-xs font-semibold rounded-md"
                >
                  <Download size={14} />
                  Download file
                </button>
              </div>

              <div className="flex-1 bg-[#0d1117] border border-[#21262d] rounded-lg p-3 overflow-y-auto max-h-[500px]">
                <pre className="text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(selectedReport, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex-1 border border-dashed border-[#21262d] rounded-lg flex flex-col items-center justify-center text-center p-6 text-gray-500">
              <FileJson size={40} className="mb-2 text-gray-600" />
              <p className="text-sm">Select a report to view metadata and download the JSON file</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
