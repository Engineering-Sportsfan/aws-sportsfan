"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  bgOpacity: number;
  color: string;
  icon: string;
  key: string;
  label: string;
  route: string;
  sport: string;
  status: string;
}

export default function CategoryListPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  const fetchCategories = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get("/api/admin/store/addCategory");
      if (res.data.success) {
        setCategories(res.data.data);
      } else {
        setError("Failed to fetch categories");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleEdit = (id: string) => {
    router.push(`/admin/store-management/category/add?id=${id}`);
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Are you sure you want to delete category "${label}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await axios.delete(`/api/admin/store/addCategory?id=${id}`);
      if (res.data.success) {
        setCategories(categories.filter(c => c.id !== id));
        alert("Category deleted successfully");
      } else {
        alert("Failed to delete category");
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || err.message || "An error occurred while deleting");
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-white">Store Categories</h1>
        <button
          onClick={() => router.push("/admin/store-management/category/add")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          + Add Category
        </button>
      </div>

      {loading ? (
        <div className="text-white">Loading categories...</div>
      ) : error ? (
        <div className="text-red-500">
          <p>{error}</p>
          <button onClick={fetchCategories} className="mt-2 bg-gray-800 px-4 py-2 rounded text-sm text-white hover:bg-gray-700">Retry</button>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-gray-400">No categories found.</div>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#0d1117] text-gray-400 border-b border-[#21262d]">
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Icon</th>
                <th className="px-4 py-3">Color</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Sport</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((item) => (
                <tr key={item.id} className="border-b border-[#21262d] hover:bg-[#0d1117]/50">
                  <td className="px-4 py-3 font-medium text-white">{item.label}</td>
                  <td className="px-4 py-3 text-gray-400">{item.key}</td>
                  <td className="px-4 py-3">{item.icon}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <span className="w-4 h-4 rounded-full border border-gray-600" style={{ backgroundColor: item.color || "transparent" }}></span>
                      <span>{item.color || "N/A"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs truncate max-w-xs">{item.route}</td>
                  <td className="px-4 py-3 capitalize">{item.sport}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${item.status === 'active' ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => handleEdit(item.id)}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.label)}
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
