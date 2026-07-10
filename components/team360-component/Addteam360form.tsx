"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, useEffect } from "react";

/*  TYPES  */

type FormState = {
    teamName: string;
    title: string;
    likes: string;
    comments: string;
    live: string;
    shares: string;
    hasVideo: boolean;
};

type CatLogo = {
    label: string;
    file: File | null;
    existingLogo?: string;
};

type Category = {
    title: string;
    file: File | null;
    existingImage?: string;
};

type CategoryKey = "title" | "file";
type CatLogoKey = "label" | "file";

type CategoryResponse = {
    title: string;
    image: string;
};

type CatLogoResponse = {
    label: string;
    logo: string;
};

/*  COMPONENT  */

export default function CreateTeam360Post({ team360IdToEdit }: { team360IdToEdit?: string; }) {
    const [form, setForm] = useState<FormState>({
        teamName: "",
        title: "",
        likes: "",
        comments: "",
        live: "",
        shares: "",
        hasVideo: false,
    });

    const [image, setImage] = useState<File | null>(null);
    const [logo, setLogo] = useState<File | null>(null);

    const [categories, setCategories] = useState<Category[]>([]);
    const [catlogos, setCatlogos] = useState<CatLogo[]>([]);

    const [existingImage, setExistingImage] = useState("");
    const [existingLogo, setExistingLogo] = useState("");

    const [loading, setLoading] = useState(false);
    const router = useRouter();
    
    const getPreview = (file: File | null, existing?: string) => {
        if (file) {
            return URL.createObjectURL(file);
        }
        return existing || "";
    };


    useEffect(() => {
        if (!team360IdToEdit) return;

        const fetchSinglePost = async () => {
            try {
                const res = await axios.get(
                    `/api/team360/${team360IdToEdit}`
                );

                const post = res.data.post;

                setForm({
                    teamName: post.teamName || "",
                    title: post.title || "",
                    likes: String(post.likes || ""),
                    comments: String(post.comments || ""),
                    live: String(post.live || ""),
                    shares: String(post.shares || ""),
                    hasVideo: post.hasVideo || false,
                });

                setExistingImage(post.image || "");
                setExistingLogo(post.logo || "");

                setCategories(
                    (post.category || []).map((cat: CategoryResponse) => ({
                        title: cat.title,
                        file: null,
                        existingImage: cat.image,
                    }))
                );

                setCatlogos(
                    (post.catlogo || []).map((item: CatLogoResponse) => ({
                        label: item.label,
                        file: null,
                        existingLogo: item.logo,
                    }))
                );
            } catch (error) {
                console.error("Failed to fetch post", error);
            }
        };

        fetchSinglePost();
    }, [team360IdToEdit]);

    /* ---------------- INPUT ---------------- */
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;

        setForm((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    /*  CATEGORY  */
    const addCategory = () => {
        setCategories((prev) => [...prev, { title: "", file: null }]);
    };

    const updateCategory = (
        i: number,
        key: CategoryKey,
        value: string | File | null
    ) => {
        const updated = [...categories];
        updated[i][key] = value as never;
        setCategories(updated);
    };

    const removeCategory = (i: number) => {
        setCategories((prev) => prev.filter((_, idx) => idx !== i));
    };

    /*  CATLOGO  */
    const addCatLogo = () => {
        setCatlogos((prev) => [...prev, { label: "", file: null }]);
    };

    const updateCatLogo = (
        i: number,
        key: CatLogoKey,
        value: string | File | null
    ) => {
        const updated = [...catlogos];
        updated[i][key] = value as never;
        setCatlogos(updated);
    };

    const removeCatLogo = (i: number) => {
        setCatlogos((prev) => prev.filter((_, idx) => idx !== i));
    };

    /*  RESET  */
    const handleCancel = () => {
        setForm({
            teamName: "",
            title: "",
            likes: "",
            comments: "",
            live: "",
            shares: "",
            hasVideo: false,
        });
        setImage(null);
        setLogo(null);
        setCategories([]);
        setCatlogos([]);
    };

    const uploadFile = async (file: File, folder: string): Promise<string> => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", folder);

        // STEP 1: Upload to /api/upload
        const response = await axios.post("/api/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });

        if (!response.data?.success || !response.data?.url) {
            throw new Error(response.data?.message || "File upload failed");
        }

        return response.data.url;
    };

    /*  SUBMIT  */
    const handleSubmit = async () => {
        if (!form.teamName || !form.title) {
            alert("Required fields missing");
            return;
        }

        if (!team360IdToEdit && (!image || !logo)) {
            alert("Main Image and Logo are required for new posts");
            return;
        }

        setLoading(true);

        try {
            let imageUrl = existingImage;
            let logoUrl = existingLogo;

            // upload only if user selected new files
            if (image) {
                imageUrl = await uploadFile(image, "Images");
            }

            if (logo) {
                logoUrl = await uploadFile(logo, "Images");
            }

            const categoryUploads = await Promise.all(
                categories.map(async (cat) => {
                    let imageUrl = cat.existingImage || "";

                    if (cat.file) {
                        imageUrl = await uploadFile(cat.file, "Images");
                    }

                    return {
                        title: cat.title,
                        image: imageUrl,
                    };
                })
            );

            const catlogoUploads = await Promise.all(
                catlogos.map(async (item) => {
                    let logoUrl = item.existingLogo || "";

                    if (item.file) {
                        logoUrl = await uploadFile(item.file, "Images");
                    }

                    return {
                        label: item.label,
                        logo: logoUrl,
                    };
                })
            );

            const payload = {
                teamName: form.teamName,
                title: form.title,
                category: categoryUploads,
                likes: Number(form.likes),
                comments: Number(form.comments),
                live: Number(form.live),
                shares: Number(form.shares),
                image: imageUrl,
                logo: logoUrl,
                catlogo: catlogoUploads,
                hasVideo: form.hasVideo,
            };

            let res;

            if (team360IdToEdit) {
                res = await axios.put(
                    `/api/team360/${team360IdToEdit}`,
                    payload
                );
            } else {
                res = await axios.post(
                    "/api/team360",
                    payload
                );
            }

            if (res.data.success) {
                alert(
                    team360IdToEdit
                        ? "Post updated successfully"
                        : "Post created successfully"
                );
         router.push("/admin/team360-management/team360-list");
                if (!team360IdToEdit) {
                    handleCancel();
                }
            }
        } catch (error: unknown) {
            console.error("Error:", error);
            const serverMessage = axios.isAxiosError(error)
                ? (error.response?.data?.error || error.response?.data?.message || error.message)
                : error instanceof Error
                    ? error.message
                    : "Error saving post";
            alert(serverMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-lg font-semibold text-white">
                    Create Team360 Post
                </h1>
            </div>

            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">

                {/* Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Team Name" name="teamName" value={form.teamName} onChange={handleChange} />
                    <Input label="Title" name="title" value={form.title} onChange={handleChange} />
                    <Input label="Likes" name="likes" value={form.likes} onChange={handleChange} />
                    <Input label="Comments" name="comments" value={form.comments} onChange={handleChange} />
                    <Input label="Live" name="live" value={form.live} onChange={handleChange} />
                    <Input label="Shares" name="shares" value={form.shares} onChange={handleChange} />
                </div>

                {/* FILES */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <FileInput label="Main Image" onChange={setImage} />

                        {existingImage && (
                            <>
                                <img
                                    src={existingImage}
                                    alt="preview"
                                    className="w-24 h-24 object-cover mt-2 rounded border"
                                />
                            </>
                        )}
                    </div>

                    <div>
                        <FileInput label="Logo" onChange={setLogo} />
                        {existingLogo && (
                            <img
                                src={existingLogo}
                                alt="preview"
                                className="w-24 h-24 object-cover mt-2 rounded"
                            />
                        )}
                    </div>
                </div>

                {/* CATEGORY */}
                <div>
                    <h2 className="text-sm text-gray-300 mb-2">Categories</h2>

                    {categories.map((cat, i) => {
                        const preview = getPreview(cat.file, cat.existingImage);

                        return (
                            <div
                                key={i}
                                className="grid grid-cols-2 gap-4 mb-4 items-start"
                            >
                                {/* Title */}
                                <input
                                    placeholder="Title"
                                    value={cat.title}
                                    onChange={(e) =>
                                        updateCategory(i, "title", e.target.value)
                                    }
                                    className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                                />

                                {/* File + Preview */}
                                <div className="w-full">
                                    <div className="flex flex-row">
                                        <input
                                            type="file"
                                            onChange={(e) =>
                                                updateCategory(i, "file", e.target.files?.[0] ?? null)
                                            }
                                            className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                                        />

                                        <button
                                            onClick={() => removeCategory(i)}
                                            className="text-red-400 hover:text-red-500 text-lg ml-4"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    {preview && (
                                        <img
                                            src={preview}
                                            alt="preview"
                                            className="w-20 h-20 object-cover mt-2 rounded border border-gray-700"
                                        />
                                    )}
                                </div>

        
                            </div>
                        );
                    })}

                    <button
                        onClick={addCategory}
                        className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded"
                    >
                        Add Category
                    </button>
                </div>

                {/* CATLOGO */}
                <div>
                    <h2 className="text-sm text-gray-300 mb-2">Stats Icons</h2>
            
                     {catlogos.map((item, i) => {
                        const preview = getPreview(item.file, item.existingLogo);

                        return (
                            <div
                                key={i}
                                className="grid grid-cols-2 gap-4 mb-4 items-start"
                            >
                                {/* Title */}
                                <input
                                    placeholder="Title"
                                    value={item.label}
                                    onChange={(e) =>
                                        updateCatLogo(i, "label", e.target.value)
                                    }
                                    className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                                />

                                {/* File + Preview */}
                                <div className="w-full">
                                    <div className="flex flex-row">
                                        <input
                                            type="file"
                                            onChange={(e) =>
                                               updateCatLogo(i, "file", e.target.files?.[0] ?? null)
                                            }
                                            className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                                        />

                                        <button
                                            onClick={() => removeCatLogo(i)}
                                            className="text-red-400 hover:text-red-500 text-lg ml-4"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    {preview && (
                                        <img
                                            src={preview}
                                            alt="preview"
                                            className="w-20 h-20 object-cover mt-2 rounded border border-gray-700"
                                        />
                                    )}
                                </div>

        
                            </div>
                        );
                    })}

                    <button onClick={addCatLogo} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-1 rounded">
                        Add Stat
                    </button>
                </div>

                {/* ACTIONS */}
                <div className="flex gap-3">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 bg-blue-600 py-3 rounded font-semibold"
                    >
                        {loading
                            ? team360IdToEdit
                                ? "Updating..."
                                : "Creating..."
                            : team360IdToEdit
                                ? "Update Post"
                                : "Create Post"}
                    </button>

                    <button
                        onClick={handleCancel}
                        className="flex-1 bg-gray-700 py-3 rounded font-semibold"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

/*  REUSABLE INPUTS  */

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
    label: string;
};

function Input({ label, ...props }: InputProps) {
    return (
        <div>
            <label className="text-xs text-gray-400">{label}</label>
            <input
                {...props}
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
            />
        </div>
    );
}

type FileInputProps = {
    label: string;
    onChange: (file: File | null) => void;
};

function FileInput({ label, onChange }: FileInputProps) {
    return (
        <div>
            <label className="text-xs text-gray-400">{label}</label>
            <input
                type="file"
                onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-white border border-gray-700 rounded cursor-pointer bg-[#0d1117] px-3 py-2"
            />
        </div>
    );
}