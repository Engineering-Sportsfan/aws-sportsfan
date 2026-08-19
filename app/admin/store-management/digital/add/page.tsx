"use client";

import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes, useEffect } from "react";

/*  TYPES  */

interface FormState {
  title: string;
  description: string;
  type: string;
  creator: string;
  duration: string;
  lessons: string;
  rewardCoins: string;
  price: string;
  governance_state: "approved" | "pending review" | "rejected" | "";
}

/*  HELPERS  */

function formatPriceString(priceVal: string | number): string {
  const clean = String(priceVal).replace(/[^0-9]/g, "");
  const num = parseInt(clean, 10);
  if (isNaN(num)) return "";
  return "₹" + num.toLocaleString('en-IN');
}

/*  COMPONENT  */

export default function CreateDigitalProduct() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditMode = !!editId;

  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    type: "Video Course",
    creator: "",
    duration: "",
    lessons: "0",
    rewardCoins: "0",
    price: "",
    governance_state: "pending review",
  });

  const [image, setImage] = useState<File | string | null>(null);
  const [hasPreview, setHasPreview] = useState<boolean>(false);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (editId) {
      setFetching(true);
      axios.get(`/api/admin/store/addDigital?id=${editId}`)
        .then(res => {
          if (res.data.success && res.data.data) {
            const data = res.data.data;
            setForm({
              title: data.title || "",
              description: data.description || "",
              type: data.type || "Video Course",
              creator: data.creator || "",
              duration: data.duration || "",
              lessons: String(data.lessons ?? "0"),
              rewardCoins: String(data.rewardCoins ?? "0"),
              price: data.pricePaise ? String(data.pricePaise / 100) : "",
              governance_state: data.governance_state || "pending review",
            });
            setImage(data.image || null);
            setHasPreview(Boolean(data.hasPreview));
            setHighlights(data.highlights || []);
          }
        })
        .catch(err => {
          console.error("Failed to fetch digital product:", err);
          alert("Failed to load digital product data for editing.");
        })
        .finally(() => {
          setFetching(false);
        });
    }
  }, [editId]);

  const getPreview = (file: File | string | null) => {
    if (!file) return "";
    if (typeof file === "string") return file;
    return URL.createObjectURL(file);
  };

  /* ---------------- INPUT ---------------- */
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  /* DYNAMIC LISTS: HIGHLIGHTS */
  const addHighlight = () => {
    setHighlights((prev) => [...prev, ""]);
  };

  const updateHighlight = (i: number, value: string) => {
    const updated = [...highlights];
    updated[i] = value;
    setHighlights(updated);
  };

  const removeHighlight = (i: number) => {
    setHighlights((prev) => prev.filter((_, idx) => idx !== i));
  };

  /* RESET */
  const handleCancel = () => {
    if (isEditMode) {
      router.push("/admin/store-management/digital/list");
    } else {
      setForm({
        title: "",
        description: "",
        type: "Video Course",
        creator: "",
        duration: "",
        lessons: "0",
        rewardCoins: "0",
        price: "",
        governance_state: "pending review",
      });
      setImage(null);
      setHasPreview(false);
      setHighlights([]);
      setErrors({});
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const response = await axios.post("/api/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (!response.data?.success || !response.data?.url) {
      throw new Error(response.data?.message || "File upload failed");
    }

    return response.data.url;
  };

  /* SUBMIT */
  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!form.title) newErrors.title = "Title is required";
    if (!form.description) newErrors.description = "Description is required";
    if (!form.type) newErrors.type = "Type is required";
    if (!form.creator) newErrors.creator = "Creator is required";
    if (!form.duration) newErrors.duration = "Duration is required";
    if (!form.price) newErrors.price = "Price is required";
    if (!image) newErrors.image = "Main Image file is required";

    // Validate highlights if provided
    for (let i = 0; i < highlights.length; i++) {
      if (!highlights[i] || highlights[i].trim() === "") {
        newErrors.highlights = "Highlights cannot be empty";
        break;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      let imageUrl = image;
      if (image instanceof File) {
        imageUrl = await uploadFile(image, "Images");
      }

      const payload = {
        title: form.title,
        description: form.description,
        type: form.type,
        creator: form.creator,
        image: imageUrl,
        governance_state: form.governance_state,
        duration: form.duration,
        lessons: Number(form.lessons) || 0,
        hasPreview,
        rewardCoins: Number(form.rewardCoins) || 0,
        price: form.price.replace(/[^0-9]/g, ""), // send raw numeric string
        highlights,
      };

      if (isEditMode) {
        const res = await axios.put(`/api/admin/store/addDigital?id=${editId}`, payload);
        if (res.data.success) {
          alert("Digital product updated successfully");
          router.push("/admin/store-management/digital/list");
        }
      } else {
        const res = await axios.post("/api/admin/store/addDigital", payload);
        if (res.data.success) {
          alert("Digital product created successfully");
          router.push("/admin/store-management/digital/list");

          handleCancel();
        }
      }
    } catch (error: unknown) {
      console.error("Error:", error);
      const serverMessage = axios.isAxiosError(error)
        ? (error.response?.data?.error || error.response?.data?.message || error.message)
        : error instanceof Error
          ? error.message
          : "Error saving digital product";
      alert(serverMessage);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-6 text-white">Loading digital product data...</div>;
  }

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">
          {isEditMode ? "Edit Digital Product" : "Create Digital Product"}
        </h1>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-8">
        
        {/* Validation Errors Box */}
        {Object.keys(errors).length > 0 && (
          <div className="bg-red-900/30 border border-red-500/50 rounded p-4">
            <h3 className="text-red-400 text-sm font-semibold mb-1">Please fix the following validation errors:</h3>
            <ul className="list-disc pl-5 text-xs text-red-300">
              {Object.entries(errors).map(([key, val]) => (
                <li key={key}>{val}</li>
              ))}
            </ul>
          </div>
        )}

        {/* BASIC INFO */}
        <div>
          <h2 className="text-md font-semibold text-white mb-4 border-b border-[#21262d] pb-2">Basic Info</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Fixed Category Input */}
            <div>
              <label className="text-xs text-gray-400">Category (Fixed)</label>
              <input
                readOnly
                value="digital"
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-gray-500 cursor-not-allowed mt-1"
              />
            </div>

            <Select label="Type *" name="type" value={form.type} onChange={handleChange} error={errors.type}>
              <option value="Video Course">Video Course</option>
              <option value="Training Program">Training Program</option>
              <option value="Digital Download">Digital Download</option>
              <option value="eBook">eBook</option>
              <option value="Webinar Recording">Webinar Recording</option>
            </Select>

            <Input label="Title *" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Javelin Throw Mastery" error={errors.title} />
            <Input label="Creator *" name="creator" value={form.creator} onChange={handleChange} placeholder="e.g. AFI Performance Lab" error={errors.creator} />
            <Input label="Duration (Content Length) *" name="duration" value={form.duration} onChange={handleChange} placeholder="e.g. 6 hrs 20 min" error={errors.duration} />
            <Input label="Lessons Count" name="lessons" type="number" value={form.lessons} onChange={handleChange} placeholder="e.g. 22 (0 if none)" />
            <Input label="Reward Coins" name="rewardCoins" type="number" value={form.rewardCoins} onChange={handleChange} />
            
            <div>
              <Input
                label="Price (Plain Number) *"
                type="text"
                name="price"
                value={form.price}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^0-9]/g, "");
                  setForm(prev => ({ ...prev, price: clean }));
                }}
                placeholder="e.g. 3999"
                error={errors.price}
              />
              {form.price && (
                <span className="text-xs text-green-400 mt-1 block">
                  → {formatPriceString(form.price)}
                </span>
              )}
            </div>

            <Select label="Governance State" name="governance_state" value={form.governance_state} onChange={handleChange}>
              <option value="pending review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>

            <div className="flex items-center space-x-2 pt-6">
              <input
                type="checkbox"
                id="preview-toggle"
                checked={hasPreview}
                onChange={(e) => setHasPreview(e.target.checked)}
                className="rounded bg-[#0d1117] border-gray-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="preview-toggle" className="text-xs text-gray-400 cursor-pointer select-none">
                Allow free preview
              </label>
            </div>

            <div className="col-span-1 md:col-span-2">
              <Textarea label="Description *" name="description" value={form.description} onChange={handleChange} placeholder="Biomechanics, angle analysis, and training runs..." error={errors.description} />
            </div>

            <div className="col-span-1 md:col-span-2">
              <FileInput label="Main Image *" onChange={setImage} error={errors.image} />
              {image && (
                <img
                  src={getPreview(image)}
                  alt="preview"
                  className="w-24 h-24 object-cover mt-2 rounded border border-gray-700"
                />
              )}
            </div>

          </div>
        </div>

        {/* HIGHLIGHTS */}
        <div>
          <h2 className="text-md font-semibold text-white mb-4 border-b border-[#21262d] pb-2">Product Highlights</h2>
          
          <div className="space-y-3">
            {highlights.map((highlight, i) => (
              <div key={i} className="flex flex-row gap-4 items-center">
                <div className="flex-1">
                  <input
                    placeholder={`Highlight ${i + 1} (e.g. Certificate of completion)`}
                    value={highlight}
                    onChange={(e) => updateHighlight(i, e.target.value)}
                    className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeHighlight(i)}
                  className="text-red-400 hover:text-red-500 text-sm font-semibold"
                >
                  ✕ Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addHighlight}
            className="text-blue-400 text-sm bg-[#0d1117] px-4 py-2 mt-3 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
          >
            + Add Highlight Row
          </button>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3 pt-4 border-t border-[#21262d]">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {loading ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update Digital Product" : "Create Digital Product")}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white transition-colors"
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
  error?: string;
};

function Input({ label, error, ...props }: InputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        {...props}
        className={`w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white focus:outline-none mt-1 ${
          error ? "border-red-500" : "border-gray-700 focus:border-blue-500"
        }`}
      />
      {error && <span className="text-red-500 text-xs mt-1 block">{error}</span>}
    </div>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

function Textarea({ label, error, ...props }: TextareaProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <textarea
        {...props}
        className={`w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white min-h-[100px] focus:outline-none mt-1 ${
          error ? "border-red-500" : "border-gray-700 focus:border-blue-500"
        }`}
      />
      {error && <span className="text-red-500 text-xs mt-1 block">{error}</span>}
    </div>
  );
}

type SelectProps = InputHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  children: React.ReactNode;
};

function Select({ label, error, children, ...props }: SelectProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <select
        {...props}
        className={`w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white focus:outline-none mt-1 ${
          error ? "border-red-500" : "border-gray-700 focus:border-blue-500"
        }`}
      >
        {children}
      </select>
      {error && <span className="text-red-500 text-xs mt-1 block">{error}</span>}
    </div>
  );
}

type FileInputProps = {
  label: string;
  error?: string;
  onChange: (file: File | null) => void;
};

function FileInput({ label, error, onChange }: FileInputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type="file"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className={`w-full text-sm text-white border rounded cursor-pointer bg-[#0d1117] px-3 py-2 focus:outline-none mt-1 ${
          error ? "border-red-500" : "border-gray-700"
        }`}
      />
      {error && <span className="text-red-500 text-xs mt-1 block">{error}</span>}
    </div>
  );
}
