"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface Athlete {
  id: string;
  name: string;
  discipline: string;
  image: string;
  governance_state: string;
  rewardCoins: number;
}

export default function AthleteListPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  const fetchAthletes = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get("/api/admin/store/addAthlete");
      if (res.data.success) {
        setAthletes(res.data.data);
      } else {
        setError("Failed to fetch athletes");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAthletes();
  }, []);

  const handleEdit = (id: string) => {
    router.push(`/admin/store-management/athlete/add?id=${id}`);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) {
      return;
    }
    
    try {
      const res = await axios.delete(`/api/admin/store/addAthlete?id=${id}`);
      if (res.data.success) {
        setAthletes(athletes.filter(a => a.id !== id));
        alert("Athlete deleted successfully");
      } else {
        alert("Failed to delete athlete");
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || err.message || "An error occurred while deleting");
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-white">Athletes</h1>
        <button
          onClick={() => router.push("/admin/store-management/athlete/add")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          + Add Athlete
        </button>
      </div>

      {loading ? (
        <div className="text-white">Loading athletes...</div>
      ) : error ? (
        <div className="text-red-500">
          <p>{error}</p>
          <button onClick={fetchAthletes} className="mt-2 bg-gray-800 px-4 py-2 rounded text-sm text-white hover:bg-gray-700">Retry</button>
        </div>
      ) : athletes.length === 0 ? (
        <div className="text-gray-400">No athletes found.</div>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#0d1117] text-gray-400 border-b border-[#21262d]">
              <tr>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Discipline</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((athlete) => (
                <tr key={athlete.id} className="border-b border-[#21262d] hover:bg-[#0d1117]/50">
                  <td className="px-4 py-3">
                    {athlete.image ? (
                      <img src={athlete.image} alt={athlete.name} className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-800 rounded"></div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{athlete.name}</td>
                  <td className="px-4 py-3">{athlete.discipline}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${athlete.governance_state === 'approved' ? 'bg-green-900/30 text-green-400 border border-green-800' : athlete.governance_state === 'rejected' ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'}`}>
                      {athlete.governance_state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => handleEdit(athlete.id)}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(athlete.id, athlete.name)}
                      className="text-red-400 hover:text-red-300 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
