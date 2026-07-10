// "use client";

// import axios from "axios";
// import { Pencil, Trash2 } from "lucide-react";
// import { useRouter } from "next/navigation";
// import { use, useEffect, useState } from "react";

// type Article = {
//     id: string;
//     badge: "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";
//     title: string;
//     readTime: string;
//     views: string;
//     image: string;
//     createdAt: number;
//     updatedAt: number;
// };

// export default function CricketArticleViewPage({
//     params,
// }: {
//     params: Promise<{ id: string }>;
// }) {
//     const { id } = use(params);
//     const [article, setArticle] = useState<Article | null>(null);
//     const router = useRouter();

//     useEffect(() => {
//         if (!id) return;

//         const fetchArticle = async () => {
//             const res = await axios.get(`/api/cricket-articles/${id}`);
//             setArticle(res.data.article);
//         };

//         fetchArticle();
//     }, [id]);

//     const handleEdit = () => {
//         router.push(
//             `/admin/cricketarticles-management/add-cricketarticles?id=${id}`
//         );
//     };

//     const handleDelete = async () => {
//         const confirmDelete = window.confirm("Delete this article?");
//         if (!confirmDelete) return;

//         try {
//             await axios.delete(`/api/cricket-articles/${id}`);
//             alert("Article deleted successfully");

//             router.push(
//                 "/admin/cricketarticles-management/cricketarticles-list"
//             );
//         } catch (error) {
//             console.error("Delete failed", error);
//             alert("Failed to delete article");
//         }
//     };

//     if (!article) {
//         return <p className="text-white p-6">Loading...</p>;
//     }

//     return (
//         <div className="max-w-[1200px] mx-auto p-6 text-white">
//             <div className="flex items-center justify-between mb-6">
//                 <h1 className="text-xl font-bold">Article Details</h1>

//                 <div className="flex items-center gap-3">
//                     <button
//                         onClick={handleEdit}
//                         className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
//                     >
//                         <Pencil size={18} />
//                     </button>

//                     <button
//                         onClick={handleDelete}
//                         className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
//                     >
//                         <Trash2 size={18} />
//                     </button>
//                 </div>
//             </div>

//             {/* SIDE BY SIDE LAYOUT */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//                 {/* LEFT: TEXT DATA */}
//                 <div className="bg-[#161b22] rounded-lg p-6 space-y-3">
//                     <p><b>Badge:</b> {article.badge}</p>
//                     <p><b>Title:</b> {article.title}</p>
//                     <p><b>Read Time:</b> {article.readTime}</p>
//                     <p><b>Views:</b> {article.views}</p>
//                     {/* <p>
//                         <b>Created At:</b>{" "}
//                         {new Date(article.createdAt).toLocaleString()}
//                     </p>
//                     <p>
//                         <b>Updated At:</b>{" "}
//                         {new Date(article.updatedAt).toLocaleString()}
//                     </p> */}
//                 </div>

//                 {/* RIGHT: IMAGE */}
//                 <div className="bg-[#161b22] rounded-lg p-6">
//                     <h2 className="mb-4 font-semibold">Article Image</h2>
//                     <img
//                         src={article.image}
//                         alt={article.title}
//                         className="w-50 h-50 object-fit rounded border"
//                     />
//                 </div>
//             </div>
//         </div>
//     );

// }






"use client";

import axios from "axios";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

type Article = {
    id: string;
    badge: "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";
    title: string;
    description: string[];
    readTime: string;
    views: string;
    image: string;
    createdAt: number;
    updatedAt: number;
};

export default function CricketArticleViewPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const [article, setArticle] = useState<Article | null>(null);
    const router = useRouter();

    useEffect(() => {
        if (!id) return;

        const fetchArticle = async () => {
            const res = await axios.get(`/api/cricket-articles/${id}`);
            setArticle(res.data.article);
        };

        fetchArticle();
    }, [id]);

    const handleEdit = () => {
        router.push(
            `/admin/cricketarticles-management/add-cricketarticles?id=${id}`
        );
    };

    const handleDelete = async () => {
        const confirmDelete = window.confirm("Delete this article?");
        if (!confirmDelete) return;

        try {
            await axios.delete(`/api/cricket-articles/${id}`);
            alert("Article deleted successfully");
            router.push("/admin/cricketarticles-management/cricketarticles-list");
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete article");
        }
    };

    const getBadgeColor = (badge: string) => {
        switch (badge) {
            case "FEATURE": return "bg-purple-500/20 text-purple-400";
            case "ANALYSIS": return "bg-blue-500/20 text-blue-400";
            case "OPINION": return "bg-orange-500/20 text-orange-400";
            case "NEWS": return "bg-green-500/20 text-green-400";
            default: return "bg-gray-500/20 text-gray-400";
        }
    };

    if (!article) {
        return (
            <div className="flex justify-center items-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] mx-auto p-6 text-white">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold">Article Details</h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleEdit}
                        className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                    >
                        <Pencil size={18} />
                    </button>
                    <button
                        onClick={handleDelete}
                        className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* SIDE BY SIDE LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LEFT: TEXT DATA */}
                <div className="bg-[#161b22] rounded-lg p-6 space-y-4">
                    <div>
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getBadgeColor(article.badge)}`}>
                            {article.badge}
                        </span>
                    </div>
                    
                    <div>
                        <h2 className="text-2xl font-bold text-white">{article.title}</h2>
                    </div>
                    
                    <div className="flex gap-4 text-sm text-gray-400">
                        <span>📖 {article.readTime}</span>
                        <span>👁️ {article.views}</span>
                    </div>
                    
                    <div className="pt-2">
                        <h3 className="text-sm font-semibold text-gray-300 mb-2">Description</h3>
                        <div className="space-y-3">
                            {article.description && article.description.length > 0 ? (
                                article.description.map((para, idx) => (
                                    <p key={idx} className="text-sm text-gray-400 leading-relaxed">
                                        {para}
                                    </p>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 italic">No description</p>
                            )}
                        </div>
                    </div>
                    
                    <div className="pt-4 text-xs text-gray-500 border-t border-gray-700">
                        <p>Created: {new Date(article.createdAt).toLocaleString()}</p>
                        <p>Updated: {new Date(article.updatedAt).toLocaleString()}</p>
                    </div>
                </div>

                {/* RIGHT: IMAGE */}
                <div className="bg-[#161b22] rounded-lg p-6">
                    <h2 className="mb-4 font-semibold text-gray-300">Article Image</h2>
                    <img
                        src={article.image}
                        alt={article.title}
                        className="w-full object-cover rounded border border-gray-700"
                    />
                </div>
            </div>
        </div>
    );
}