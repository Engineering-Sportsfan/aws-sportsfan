"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import Link from "next/link";

interface User {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  avatar?: string;
}

export default function FlipLineAdminList() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/admin/flipline-admins");
      setAdmins(res.data.users || []);
    } catch (error) {
      console.error("Failed to fetch FlipLine admins", error);
      alert("Failed to load FlipLine admins list.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (email: string, name: string) => {
    const confirm = window.confirm(`Are you sure you want to revoke FlipLineAdmin access for ${name || email}?`);
    if (!confirm) return;

    try {
      await axios.post("/api/admin/flipline-admins", { email, role: "user" });
      alert("Access revoked successfully");
      fetchAdmins(); // Refresh
    } catch (error) {
      console.error("Failed to revoke access", error);
      alert("Failed to revoke access.");
    }
  };

  if (loading) {
    return <div className="p-10 text-white">Loading...</div>;
  }

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-white">FlipLine Admins Management</h1>
        <Link href="/admin/fliplineAdminManagement/add">
          <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-500 transition-colors">
            + Grant Admin Access
          </button>
        </Link>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#0d1117] border-b border-[#21262d] text-xs uppercase">
              <tr>
                <th className="px-6 py-4">Avatar</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No FlipLine admins found.
                  </td>
                </tr>
              ) : (
                admins.map((admin) => {
                  const fullName = [admin.firstName, admin.lastName].filter(Boolean).join(" ") || "–";
                  return (
                    <tr key={admin.email} className="border-b border-[#21262d] hover:bg-[#1c2128]">
                      <td className="px-6 py-4">
                        {admin.avatar ? (
                          <img src={admin.avatar} alt={fullName} className="w-10 h-10 object-cover rounded-full bg-gray-800" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 font-bold">
                            {(admin.firstName?.[0] || admin.email[0]).toUpperCase()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-white">{fullName}</td>
                      <td className="px-6 py-4">{admin.email}</td>
                      <td className="px-6 py-4">
                        <span className="bg-purple-900/30 text-purple-400 border border-purple-800/40 px-2 py-0.5 rounded text-xs font-bold uppercase">
                          {admin.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleRevoke(admin.email, fullName)}
                          className="text-red-500 hover:text-red-400 font-semibold transition-colors"
                        >
                          Revoke Access
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
