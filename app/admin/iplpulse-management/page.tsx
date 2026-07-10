"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Eye, FileJson, Calendar, HardDrive, Download, Trash2, Loader2 } from "lucide-react";

interface PulseFileMeta {
  id: string;
  fileName: string;
  url: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  reportDate: string | null;
  reportDateFormatted: string | null;
}

export default function IPLPulseManagementPage() {
  const [files, setFiles] = useState<PulseFileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/cloudinary/iplpulse?mode=list");
      if (res.data.success) {
        setFiles(res.data.files);
      }
    } catch (error) {
      console.error("Failed to fetch IPL Pulse files", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleDelete = async (publicId: string) => {
    if (!confirm("Are you sure you want to delete this report? This action cannot be undone.")) {
      return;
    }

    try {
      setDeletingId(publicId);
      const res = await axios.delete(`/api/cloudinary/iplpulse?publicId=${encodeURIComponent(publicId)}`);

      if (res.data.success) {
        setFiles(files.filter(f => f.id !== publicId));
        alert("File deleted successfully!");
      } else {
        alert(`Error deleting file: ${res.data.error}`);
      }
    } catch (error: unknown) {
      console.error("Failed to delete file", error);

      // Type-safe error message extraction
      let errorMessage = "Unknown error occurred";

      if (error instanceof Error) {
        errorMessage = error.message;
      }

      // Check for axios error response
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { error?: string } } };
        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        }
      }

      alert(`Failed to delete file: ${errorMessage}`);
    }
    finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">IPL Pulse Reports</h1>
        <p className="text-sm text-gray-400">
          Manage IPL Pulse JSON reports stored on Cloudinary
        </p>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Reports</p>
          <p className="text-2xl font-bold text-white">{files.length}</p>
        </div>
      </div>

      {/* REPORTS TABLE */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">File Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Report Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Size</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Uploaded At</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto"></div>
                    <p className="mt-2">Loading reports...</p>
                  </td>
                </tr>
              ) : files.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    No reports found
                  </td>
                </tr>
              ) : (
                files.map((file, index) => (
                  <tr key={file.id} className="border-b border-[#21262d] hover:bg-[#0d1117] transition">
                    <td className="px-4 py-3">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <FileJson size={16} className="text-blue-400" />
                        </div>
                        <span className="font-medium text-white">{file.fileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {file.reportDateFormatted ? (
                        <div className="flex items-center gap-1.5 text-sm text-gray-300">
                          <Calendar size={14} className="text-gray-500" />
                          {file.reportDateFormatted}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">Not specified</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-gray-400">
                        <HardDrive size={14} />
                        {file.sizeFormatted}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-400">{formatDate(file.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                          title="View JSON"
                        >
                          <Eye size={16} />
                        </a>
                        <a
                          href={file.url}
                          download
                          className="p-2 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 transition"
                          title="Download"
                        >
                          <Download size={16} />
                        </a>
                        <button
                          onClick={() => handleDelete(file.id)}
                          disabled={deletingId === file.id}
                          className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === file.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
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
    </div>
  );
}
