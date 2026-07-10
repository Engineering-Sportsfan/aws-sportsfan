"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Article = {
  id: string;
  badge: "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";
  title: string;
  readTime: string;
  views: string;
  image: string;
};

export default function CricketArticlesListPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);

      const res = await axios.get("/api/cricket-articles");

      setArticles(res.data.articles || []);
    } catch (error) {
      console.error("Failed to fetch articles", error);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (id: string) => {
    router.push(`/admin/cricketarticles-management/cricketarticles-list/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/admin/cricketarticles-management/add-cricketarticles?id=${id}`);
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = window.confirm("Delete this article?");
    if (!confirmDelete) return;

    try {
      await axios.delete(`/api/cricket-articles/${id}`);

      setArticles((prev) =>
        prev.filter((article) => article.id !== id)
      );
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete article");
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Cricket Articles</h1>
        <p className="text-sm text-gray-400">
          Manage all cricket articles
        </p>
      </div>

      {/* TABLE */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {[
                  "#",
                  "Image",
                  "Badge",
                  "Title",
                  "Read Time",
                  "Views",
                  "Actions",
                ].map((head) => (
                  <th
                    key={head}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-8 text-gray-400"
                  >
                    Loading articles...
                  </td>
                </tr>
              ) : articles.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-8 text-gray-400"
                  >
                    No articles found
                  </td>
                </tr>
              ) : (
                articles.map((article, index) => (
                  <tr
                    key={article.id}
                    className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                  >
                    <td className="px-4 py-3">{index + 1}</td>

                    <td className="px-4 py-3">
                      <img
                        src={article.image}
                        alt={article.title}
                        className="w-14 h-14 object-cover rounded"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs rounded bg-blue-500/10 text-blue-400">
                        {article.badge}
                      </span>
                    </td>

                    <td className="px-4 py-3">{article.title}</td>
                    <td className="px-4 py-3">{article.readTime}</td>
                    <td className="px-4 py-3">{article.views}</td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleView(article.id)}
                          className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => handleEdit(article.id)}
                          className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => handleDelete(article.id)}
                          className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
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
    </div>
  );
}