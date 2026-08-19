"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DigitalProduct {
  id: string;
  title: string;
  type: string;
  creator: string;
  pricePaise: number;
  image: string;
  governance_state: string;
}

export default function DigitalListPage() {
  const [digitalProducts, setDigitalProducts] = useState<DigitalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  const fetchDigitalProducts = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get("/api/admin/store/addDigital");
      if (res.data.success) {
        setDigitalProducts(res.data.data);
      } else {
        setError("Failed to fetch digital products");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDigitalProducts();
  }, []);

  const handleEdit = (id: string) => {
    router.push(`/admin/store-management/digital/add?id=${id}`);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete ${title}? This cannot be undone.`)) {
      return;
    }
    
    try {
      const res = await axios.delete(`/api/admin/store/addDigital?id=${id}`);
      if (res.data.success) {
        setDigitalProducts(digitalProducts.filter(dp => dp.id !== id));
        alert("Digital product deleted successfully");
      } else {
        alert("Failed to delete digital product");
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || err.message || "An error occurred while deleting");
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-white">Digital Products</h1>
        <button
          onClick={() => router.push("/admin/store-management/digital/add")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          + Add Digital Product
        </button>
      </div>

      {loading ? (
        <div className="text-white">Loading digital products...</div>
      ) : error ? (
        <div className="text-red-500">
          <p>{error}</p>
          <button onClick={fetchDigitalProducts} className="mt-2 bg-gray-800 px-4 py-2 rounded text-sm text-white hover:bg-gray-700">Retry</button>
        </div>
      ) : digitalProducts.length === 0 ? (
        <div className="text-gray-400">No digital products found.</div>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#0d1117] text-gray-400 border-b border-[#21262d]">
              <tr>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Creator</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {digitalProducts.map((item) => (
                <tr key={item.id} className="border-b border-[#21262d] hover:bg-[#0d1117]/50">
                  <td className="px-4 py-3">
                    {item.image ? (
                      <img src={item.image} alt={item.title} className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-800 rounded"></div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{item.title}</td>
                  <td className="px-4 py-3">{item.type}</td>
                  <td className="px-4 py-3">{item.creator}</td>
                  <td className="px-4 py-3">₹{(item.pricePaise / 100).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${item.governance_state === 'approved' ? 'bg-green-900/30 text-green-400 border border-green-800' : item.governance_state === 'rejected' ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'}`}>
                      {item.governance_state}
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
                      onClick={() => handleDelete(item.id, item.title)}
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
