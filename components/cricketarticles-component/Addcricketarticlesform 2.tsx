// "use client";

// import axios from "axios";
// import { useRouter } from "next/navigation";
// import { useEffect, useState } from "react";
// import { Plus, Trash2, GripVertical } from "lucide-react";

// type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";
'.'
// type FormState = {
//     badge: BadgeType;
//     title: string;
//     author: string,
//     description: string[];
//     readTime: string;
//     views: string;
// };

// export default function CricketArticleForm({
//     articleIdToEdit,
// }: {
//     articleIdToEdit?: string;
// }) {
//     const [form, setForm] = useState<FormState>({
//         badge: "NEWS",
//         title: "",
//         author: "",
//         description: [""], // Start with one empty paragraph
//         readTime: "5 min read",
//         views: "0 views",
//     });

//     const [image, setImage] = useState<File | null>(null);
//     const [existingImage, setExistingImage] = useState("");
//     const [loading, setLoading] = useState(false);
//     const router = useRouter();

//     /*  FETCH SINGLE ARTICLE  */
//     useEffect(() => {
//         if (!articleIdToEdit) return;

//         const fetchArticle = async () => {
//             try {
//                 const res = await axios.get(
//                     `/api/cricket-articles/${articleIdToEdit}`
//                 );

//                 const article = res.data.article;

//                 setForm({
//                     badge: article.badge || "NEWS",
//                     title: article.title || "",
//                     author: article.author || "",
//                     description: article.description || [""],
//                     readTime: article.readTime || "5 min read",
//                     views: article.views || "0 views",
//                 });

//                 setExistingImage(article.image || "");
//             } catch (error) {
//                 console.error("Failed to fetch article", error);
//             }
//         };

//         fetchArticle();
//     }, [articleIdToEdit]);

//     const handleCancel = () => {
//         setForm({
//             badge: "NEWS",
//             title: "",
//             author: "",
//             description: [""],
//             readTime: "5 min read",
//             views: "0 views",
//         });
//         setImage(null);
//         setExistingImage("");
//     };

//     /*  INPUT CHANGE  */
//     const handleChange = (
//         e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
//     ) => {
//         setForm((prev) => ({
//             ...prev,
//             [e.target.name]: e.target.value,
//         }));
//     };

//     /*  DESCRIPTION PARAGRAPH HANDLERS  */
//     const handleDescriptionChange = (index: number, value: string) => {
//         const updatedDescriptions = [...form.description];
//         updatedDescriptions[index] = value;
//         setForm((prev) => ({
//             ...prev,
//             description: updatedDescriptions,
//         }));
//     };

//     const addDescriptionParagraph = () => {
//         setForm((prev) => ({
//             ...prev,
//             description: [...prev.description, ""],
//         }));
//     };

//     const removeDescriptionParagraph = (index: number) => {
//         if (form.description.length === 1) {
//             alert("At least one paragraph is required");
//             return;
//         }

//         const updatedDescriptions = form.description.filter((_, i) => i !== index);
//         setForm((prev) => ({
//             ...prev,
//             description: updatedDescriptions,
//         }));
//     };

//     const moveParagraphUp = (index: number) => {
//         if (index === 0) return;
//         const updated = [...form.description];
//         [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
//         setForm((prev) => ({ ...prev, description: updated }));
//     };

//     const moveParagraphDown = (index: number) => {
//         if (index === form.description.length - 1) return;
//         const updated = [...form.description];
//         [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
//         setForm((prev) => ({ ...prev, description: updated }));
//     };

//     /*  FILE UPLOAD  */
//     const uploadFile = async (file: File) => {
//         const formData = new FormData();
//         formData.append("file", file);
//         formData.append("folder", "Images");

//         const res = await axios.post("/api/upload", formData);
//         return res.data.url;
//     };

//     /*  SUBMIT  */
//     const handleSubmit = async () => {
//         if (!form.title) {
//             alert("Title is required");
//             return;
//         }

//         // Filter out empty paragraphs
//         const nonEmptyDescriptions = form.description.filter(p => p.trim() !== "");

//         if (nonEmptyDescriptions.length === 0) {
//             alert("At least one description paragraph is required");
//             return;
//         }

//         setLoading(true);

//         try {
//             let imageUrl = existingImage;

//             if (image) {
//                 imageUrl = await uploadFile(image);
//             }

//             const payload = {
//                 ...form,
//                 description: nonEmptyDescriptions,
//                 image: imageUrl,
//             };

//             let res;

//             if (articleIdToEdit) {
//                 res = await axios.put(
//                     `/api/cricket-articles/${articleIdToEdit}`,
//                     payload
//                 );
//             } else {
//                 res = await axios.post("/api/cricket-articles", payload);
//             }

//             if (res.data.success) {
//                 alert(
//                     articleIdToEdit
//                         ? "Article updated successfully"
//                         : "Article created successfully"
//                 );
//                 router.push("/admin/cricketarticles-management/cricketarticles-list");

//                 if (!articleIdToEdit) {
//                     setForm({
//                         badge: "NEWS",
//                         title: "",
//                         author: "",
//                         description: [""],
//                         readTime: "5 min read",
//                         views: "0 views",
//                     });
//                     setImage(null);
//                     setExistingImage("");
//                 }
//             }
//         } catch (error) {
//             console.error("Save failed", error);
//             alert("Error saving article");
//         } finally {
//             setLoading(false);
//         }
//     };

//     const preview = image ? URL.createObjectURL(image) : existingImage;

//     return (
//         <div className="max-w-[1440px] mx-auto p-6 text-white">
//             <h1 className="text-xl font-bold mb-6">
//                 {articleIdToEdit ? "Edit Article" : "Create Cricket Article"}
//             </h1>

//             <div className="bg-[#161b22] rounded-lg p-6 space-y-6">
//                 {/* INPUTS */}
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                     <div>
//                         <label className="text-xs text-gray-400 block mb-1">Badge</label>
//                         <select
//                             name="badge"
//                             value={form.badge}
//                             onChange={handleChange}
//                             className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white"
//                         >
//                             <option value="FEATURE">FEATURE</option>
//                             <option value="ANALYSIS">ANALYSIS</option>
//                             <option value="OPINION">OPINION</option>
//                             <option value="NEWS">NEWS</option>
//                         </select>
//                     </div>

//                     <Input
//                         label="Title"
//                         name="title"
//                         value={form.title}
//                         onChange={handleChange}
//                         placeholder="Enter article title"
//                     />

//                     <Input
//                         label="Author"
//                         name="author"
//                         value={form.author}
//                         onChange={handleChange}
//                         placeholder="Enter Author"
//                     />

//                     <Input
//                         label="Read Time"
//                         name="readTime"
//                         value={form.readTime}
//                         onChange={handleChange}
//                         placeholder="e.g., 5 min read"
//                     />

//                     <Input
//                         label="Views"
//                         name="views"
//                         value={form.views}
//                         onChange={handleChange}
//                         placeholder="e.g., 0 views"
//                     />
//                 </div>

//                 {/* DESCRIPTION SECTION - Dynamic Paragraphs */}
//                 <div>
//                     <div className="flex items-center justify-between mb-3">
//                         <label className="text-xs text-gray-400 block">
//                             Description Paragraphs
//                         </label>
//                         <button
//                             type="button"
//                             onClick={addDescriptionParagraph}
//                             className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition"
//                         >
//                             <Plus size={14} />
//                             Add Paragraph
//                         </button>
//                     </div>

//                     <div className="space-y-4">
//                         {form.description.map((paragraph, index) => (
//                             <div
//                                 key={index}
//                                 className="border border-gray-700 rounded-lg p-4 bg-[#0d1117]/50"
//                             >
//                                 <div className="flex items-center justify-between mb-2">
//                                     <div className="flex items-center gap-2">
//                                         <GripVertical size={16} className="text-gray-500 cursor-move" />
//                                         <span className="text-xs text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded">
//                                             Paragraph {index + 1}
//                                         </span>
//                                     </div>
//                                     <div className="flex gap-2">
//                                         {index > 0 && (
//                                             <button
//                                                 type="button"
//                                                 onClick={() => moveParagraphUp(index)}
//                                                 className="text-gray-400 hover:text-white transition"
//                                                 title="Move Up"
//                                             >
//                                                 ↑
//                                             </button>
//                                         )}
//                                         {index < form.description.length - 1 && (
//                                             <button
//                                                 type="button"
//                                                 onClick={() => moveParagraphDown(index)}
//                                                 className="text-gray-400 hover:text-white transition"
//                                                 title="Move Down"
//                                             >
//                                                 ↓
//                                             </button>
//                                         )}
//                                         <button
//                                             type="button"
//                                             onClick={() => removeDescriptionParagraph(index)}
//                                             className="text-red-500 hover:text-red-400 transition"
//                                             title="Remove Paragraph"
//                                         >
//                                             <Trash2 size={16} />
//                                         </button>
//                                     </div>
//                                 </div>
//                                 <textarea
//                                     value={paragraph}
//                                     onChange={(e) => handleDescriptionChange(index, e.target.value)}
//                                     placeholder={`Write paragraph ${index + 1}...`}
//                                     rows={4}
//                                     className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 resize-y"
//                                 />
//                             </div>
//                         ))}
//                     </div>

//                     <p className="text-xs text-gray-500 mt-2">
//                         {form.description.filter(p => p.trim() !== "").length} non-empty paragraph(s)
//                     </p>
//                 </div>

//                 {/* IMAGE */}
//                 <div>
//                     <label className="text-xs text-gray-400 mb-1 block">Article Image</label>
//                     <input
//                         type="file"
//                         accept="image/*"
//                         onChange={(e) => setImage(e.target.files?.[0] ?? null)}
//                         className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-500 file:text-white hover:file:bg-blue-600"
//                     />

//                     {preview && (
//                         <img
//                             src={preview}
//                             alt="preview"
//                             className="w-32 h-32 object-cover rounded mt-3 border border-gray-700"
//                         />
//                     )}
//                 </div>

//                 {/* ACTION BUTTONS */}
//                 <div className="flex gap-3">
//                     <button
//                         onClick={handleSubmit}
//                         disabled={loading}
//                         className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
//                     >
//                         {loading
//                             ? articleIdToEdit
//                                 ? "Updating..."
//                                 : "Creating..."
//                             : articleIdToEdit
//                                 ? "Update Article"
//                                 : "Create Article"}
//                     </button>

//                     <button
//                         onClick={handleCancel}
//                         type="button"
//                         className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold transition"
//                     >
//                         Cancel
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );
// }

// function Input({
//     label,
//     ...props
// }: React.InputHTMLAttributes<HTMLInputElement> & {
//     label: string;
// }) {
//     return (
//         <div>
//             <label className="text-xs text-gray-400 mb-1 block">{label}</label>
//             <input
//                 {...props}
//                 className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
//             />
//         </div>
//     );
// }





"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { RichTextEditor } from "./Richtexteditor"; 

type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

type FormState = {
    badge: BadgeType;
    title: string;
    author: string;
    description: string[];
    readTime: string;
    views: string;
    tags: string[];
};

export default function CricketArticleForm({
    articleIdToEdit,
}: {
    articleIdToEdit?: string;
}) {
    const [form, setForm] = useState<FormState>({
        badge: "NEWS",
        title: "",
        author: "",
        description: [""],
        readTime: "5 min read",
        views: "0 views",
        tags: [],
    });

    const [tagInput, setTagInput] = useState("");
    const [image, setImage] = useState<File | null>(null);
    const [existingImage, setExistingImage] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const newTag = tagInput.trim();
            if (newTag && !form.tags.includes(newTag)) {
                setForm((prev) => ({
                    ...prev,
                    tags: [...prev.tags, newTag],
                }));
                setTagInput("");
            }
        }
    };

    const removeTag = (indexToRemove: number) => {
        setForm((prev) => ({
            ...prev,
            tags: prev.tags.filter((_, index) => index !== indexToRemove),
        }));
    };

    /*  FETCH SINGLE ARTICLE  */
    useEffect(() => {
        if (!articleIdToEdit) return;

        const fetchArticle = async () => {
            try {
                const res = await axios.get(`/api/cricket-articles/${articleIdToEdit}`);
                const article = res.data.article;

                setForm({
                    badge: article.badge || "NEWS",
                    title: article.title || "",
                    author: article.author || "",
                    description: article.description || [""],
                    readTime: article.readTime || "5 min read",
                    views: article.views || "0 views",
                    tags: article.tags || [],
                });

                setExistingImage(article.image || "");
            } catch (error) {
                console.error("Failed to fetch article", error);
            }
        };

        fetchArticle();
    }, [articleIdToEdit]);

    const handleCancel = () => {
        setForm({
            badge: "NEWS",
            title: "",
            author: "",
            description: [""],
            readTime: "5 min read",
            views: "0 views",
            tags: [],
        });
        setImage(null);
        setExistingImage("");
    };

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    /*  DESCRIPTION PARAGRAPH HANDLERS  */
    const handleDescriptionChange = (index: number, value: string) => {
        const updated = [...form.description];
        updated[index] = value;
        setForm((prev) => ({ ...prev, description: updated }));
    };

    const addDescriptionParagraph = () => {
        setForm((prev) => ({ ...prev, description: [...prev.description, ""] }));
    };

    const removeDescriptionParagraph = (index: number) => {
        if (form.description.length === 1) {
            alert("At least one paragraph is required");
            return;
        }
        setForm((prev) => ({
            ...prev,
            description: prev.description.filter((_, i) => i !== index),
        }));
    };

    const moveParagraphUp = (index: number) => {
        if (index === 0) return;
        const updated = [...form.description];
        [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
        setForm((prev) => ({ ...prev, description: updated }));
    };

    const moveParagraphDown = (index: number) => {
        if (index === form.description.length - 1) return;
        const updated = [...form.description];
        [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
        setForm((prev) => ({ ...prev, description: updated }));
    };

    /*  FILE UPLOAD  */
    const uploadFile = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "Images");
        const res = await axios.post("/api/upload", formData);
        return res.data.url;
    };

    /*  SUBMIT  */
    const handleSubmit = async () => {
        if (!form.title) {
            alert("Title is required");
            return;
        }

        // Strip HTML tags to check if paragraph is truly empty
        const stripHtml = (html: string) =>
            html.replace(/<[^>]*>/g, "").trim();

        const nonEmptyDescriptions = form.description.filter(
            (p) => stripHtml(p) !== ""
        );

        if (nonEmptyDescriptions.length === 0) {
            alert("At least one description paragraph is required");
            return;
        }

        setLoading(true);

        try {
            let imageUrl = existingImage;
            if (image) imageUrl = await uploadFile(image);

            const payload = {
                ...form,
                description: nonEmptyDescriptions,
                image: imageUrl,
            };

            let res;
            if (articleIdToEdit) {
                res = await axios.put(`/api/cricket-articles/${articleIdToEdit}`, payload);
            } else {
                res = await axios.post("/api/cricket-articles", payload);
            }

            if (res.data.success) {
                alert(
                    articleIdToEdit
                        ? "Article updated successfully"
                        : "Article created successfully"
                );
                router.push(
                    "/admin/cricketarticles-management/cricketarticles-list"
                );

                if (!articleIdToEdit) {
                    setForm({
                        badge: "NEWS",
                        title: "",
                        author: "",
                        description: [""],
                        readTime: "5 min read",
                        views: "0 views",
                        tags: [],
                    });
                    setImage(null);
                    setExistingImage("");
                }
            }
        } catch (error) {
            console.error("Save failed", error);
            alert("Error saving article");
        } finally {
            setLoading(false);
        }
    };

    const preview = image ? URL.createObjectURL(image) : existingImage;

    // Count non-empty paragraphs (strip HTML before checking)
    const nonEmptyCount = form.description.filter(
        (p) => p.replace(/<[^>]*>/g, "").trim() !== ""
    ).length;

    return (
        <div className="max-w-[1440px] mx-auto p-6 text-white">
            <h1 className="text-xl font-bold mb-6">
                {articleIdToEdit ? "Edit Article" : "Create Cricket Article"}
            </h1>

            <div className="bg-[#161b22] rounded-lg p-6 space-y-6">
                {/* INPUTS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Badge</label>
                        <select
                            name="badge"
                            value={form.badge}
                            onChange={handleChange}
                            className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white"
                        >
                            <option value="FEATURE">FEATURE</option>
                            <option value="ANALYSIS">ANALYSIS</option>
                            <option value="OPINION">OPINION</option>
                            <option value="NEWS">NEWS</option>
                        </select>
                    </div>

                    <Input
                        label="Title"
                        name="title"
                        value={form.title}
                        onChange={handleChange}
                        placeholder="Enter article title"
                    />
                    <Input
                        label="Author"
                        name="author"
                        value={form.author}
                        onChange={handleChange}
                        placeholder="Enter Author"
                    />
                    <Input
                        label="Read Time"
                        name="readTime"
                        value={form.readTime}
                        onChange={handleChange}
                        placeholder="e.g., 5 min read"
                    />
                    <Input
                        label="Views"
                        name="views"
                        value={form.views}
                        onChange={handleChange}
                        placeholder="e.g., 0 views"
                    />
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Article Tags</label>
                        <div className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 focus-within:border-blue-500 focus-within:outline-none">
                            <div className="flex flex-wrap gap-2 mb-2">
                                {form.tags.map((tag, index) => (
                                    <span 
                                        key={index} 
                                        className="flex items-center gap-1 bg-blue-500/20 text-blue-500 px-2 py-1 rounded text-xs"
                                    >
                                        {tag}
                                        <button 
                                            type="button" 
                                            onClick={() => removeTag(index)}
                                            className="hover:text-white transition"
                                        >
                                            &times;
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type tag and press Enter..."
                                className="w-full bg-transparent border-none text-white text-sm focus:outline-none"
                            />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">Press Enter to add multiple tags</p>
                    </div>
                </div>

                {/* DESCRIPTION SECTION */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-xs text-gray-400">
                            Description Paragraphs
                        </label>
                        <button
                            type="button"
                            onClick={addDescriptionParagraph}
                            className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition"
                        >
                            <Plus size={14} />
                            Add Paragraph
                        </button>
                    </div>

                    <div className="space-y-4">
                        {form.description.map((paragraph, index) => (
                            <div
                                key={index}
                                className="border border-gray-700 rounded-lg p-4 bg-[#0d1117]/50"
                            >
                                {/* Paragraph header */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <GripVertical
                                            size={16}
                                            className="text-gray-500 cursor-move"
                                        />
                                        <span className="text-xs text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded">
                                            Paragraph {index + 1}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        {index > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => moveParagraphUp(index)}
                                                className="text-gray-400 hover:text-white transition"
                                                title="Move Up"
                                            >
                                                ↑
                                            </button>
                                        )}
                                        {index < form.description.length - 1 && (
                                            <button
                                                type="button"
                                                onClick={() => moveParagraphDown(index)}
                                                className="text-gray-400 hover:text-white transition"
                                                title="Move Down"
                                            >
                                                ↓
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => removeDescriptionParagraph(index)}
                                            className="text-red-500 hover:text-red-400 transition"
                                            title="Remove Paragraph"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* ✅ Rich Text Editor replaces plain textarea */}
                                <RichTextEditor
                                    value={paragraph}
                                    onChange={(val) => handleDescriptionChange(index, val)}
                                    placeholder={`Write paragraph ${index + 1}...`}
                                    minHeight={140}
                                />
                            </div>
                        ))}
                    </div>

                    <p className="text-xs text-gray-500 mt-2">
                        {nonEmptyCount} non-empty paragraph(s)
                    </p>
                </div>

                {/* IMAGE */}
                <div>
                    <label className="text-xs text-gray-400 mb-1 block">
                        Article Image
                    </label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                        className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-500 file:text-white hover:file:bg-blue-600"
                    />
                    {preview && (
                        <img
                            src={preview}
                            alt="preview"
                            className="w-32 h-32 object-cover rounded mt-3 border border-gray-700"
                        />
                    )}
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex gap-3">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        {loading
                            ? articleIdToEdit
                                ? "Updating..."
                                : "Creating..."
                            : articleIdToEdit
                            ? "Update Article"
                            : "Create Article"}
                    </button>

                    <button
                        onClick={handleCancel}
                        type="button"
                        className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold transition"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

function Input({
    label,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
    return (
        <div>
            <label className="text-xs text-gray-400 mb-1 block">{label}</label>
            <input
                {...props}
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
            />
        </div>
    );
}
