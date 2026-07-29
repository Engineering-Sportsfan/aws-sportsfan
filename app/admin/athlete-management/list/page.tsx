"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Athlete {
  id: string;
  name: string;
  country: string;
  sport: string;
  image: string;
  isVerified: boolean;
  fanImpactScore: number;
}

export default function AthleteManagementList() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchAthletes();
  }, []);

  const fetchAthletes = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/admin/athleteProfile");
      setAthletes(res.data.data || []);
    } catch (error) {
      console.error("Failed to fetch athletes", error);
      alert("Failed to load athlete profiles.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirm = window.confirm(`Are you sure you want to delete the profile for ${name}?`);
    if (!confirm) return;

    try {
      await axios.delete(`/api/admin/athleteProfile?id=${id}`);
      alert("Deleted successfully");
      fetchAthletes(); // Refresh list
    } catch (error) {
      console.error("Failed to delete", error);
      alert("Failed to delete athlete profile.");
    }
  };

  if (loading) {
    return <div className="p-10 text-white">Loading...</div>;
  }

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-white">Athlete Profiles Management</h1>
        <Link href="/admin/athlete-management/add">
          <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-500">
            + Add New Profile
          </button>
        </Link>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#0d1117] border-b border-[#21262d] text-xs uppercase">
              <tr>
                <th className="px-6 py-4">Image</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Country</th>
                <th className="px-6 py-4">Sport</th>
                <th className="px-6 py-4 text-center">Verified</th>
                <th className="px-6 py-4 text-center">Fan Impact</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {athletes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No athlete profiles found.
                  </td>
                </tr>
              ) : (
                athletes.map((athlete) => (
                  <tr key={athlete.id} className="border-b border-[#21262d] hover:bg-[#1c2128]">
                    <td className="px-6 py-4">
                      {athlete.image ? (
                        <img src={athlete.image} alt={athlete.name} className="w-10 h-10 object-cover rounded-full bg-gray-800" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-500">?</div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">{athlete.name}</td>
                    <td className="px-6 py-4">{athlete.country}</td>
                    <td className="px-6 py-4 text-blue-400">{athlete.sport}</td>
                    <td className="px-6 py-4 text-center">
                      {athlete.isVerified ? (
                        <span className="text-green-500 bg-green-500/10 px-2 py-1 rounded text-xs font-semibold">Yes</span>
                      ) : (
                        <span className="text-gray-500 bg-gray-500/10 px-2 py-1 rounded text-xs">No</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-yellow-500 font-mono bg-yellow-500/10 px-2 py-1 rounded text-xs">
                        {athlete.fanImpactScore}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      <button
                        onClick={() => router.push(`/admin/athlete-management/add?id=${athlete.id}`)}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
