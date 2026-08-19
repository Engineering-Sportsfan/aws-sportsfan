"use client";

import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, useEffect } from "react";

/*  TYPES  */

interface FormState {
  title: string;
  athlete: string;
  subCategory: "Signed Jerseys" | "Equipment" | "Match-worn Gear" | "Trophies & Medals" | "Other" | "";
  serialNo: string;
  rewardCoins: string;
  governance_state: "pending review" | "approved" | "rejected" | "";
}

/*  HELPERS  */

function formatPriceString(priceVal: string | number): string {
  const clean = String(priceVal).replace(/[^0-9]/g, "");
  const num = parseInt(clean, 10);
  if (isNaN(num)) return "";
  return "₹" + num.toLocaleString('en-IN');
}

/*  COMPONENT  */

export default function CreateMemorabilia() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditMode = !!editId;

  const [form, setForm] = useState<FormState>({
    title: "",
    athlete: "",
    subCategory: "",
    serialNo: "",
    rewardCoins: "0",
    governance_state: "pending review",
  });

  const [price, setPrice] = useState<string>("");
  const [certified, setCertified] = useState<boolean>(false);
  const [image, setImage] = useState<File | string | null>(null);
  const [ownerHistory, setOwnerHistory] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (editId) {
      setFetching(true);
      axios.get(`/api/admin/store/addMerchandise?id=${editId}`)
        .then(res => {
          if (res.data.success && res.data.data) {
            const data = res.data.data;
            setForm({
              title: data.title || "",
              athlete: data.athlete || "",
              subCategory: data.subCategory || "",
              serialNo: data.serialNo || "",
              rewardCoins: data.rewardCoins ?? "0",
              governance_state: data.governance_state || "pending review",
            });
            setPrice(data.pricePaise ? String(data.pricePaise / 100) : "");
            setCertified(Boolean(data.certified));
            setImage(data.image || null);
            setOwnerHistory(data.ownerHistory || []);
          }
        })
        .catch(err => {
          console.error("Failed to fetch merchandise:", err);
          alert("Failed to load merchandise data for editing.");
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
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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

  /* DYNAMIC LISTS: OWNER HISTORY */
  const addOwner = () => {
    setOwnerHistory((prev) => [...prev, ""]);
  };

  const updateOwner = (i: number, value: string) => {
    const updated = [...ownerHistory];
    updated[i] = value;
    setOwnerHistory(updated);
  };

  const removeOwner = (i: number) => {
    setOwnerHistory((prev) => prev.filter((_, idx) => idx !== i));
  };

  /* RESET */
  const handleCancel = () => {
    if (isEditMode) {
      router.push("/admin/store-management/merchandise/list");
    } else {
      setForm({
        title: "",
        athlete: "",
        subCategory: "",
        serialNo: "",
        rewardCoins: "0",
        governance_state: "pending review",
      });
      setPrice("");
      setCertified(false);
      setImage(null);
      setOwnerHistory([]);
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
    if (!form.athlete) newErrors.athlete = "Athlete is required";
    if (!form.subCategory) newErrors.subCategory = "Subcategory is required";
    if (!form.serialNo) newErrors.serialNo = "Serial Number is required";
    if (!price) newErrors.price = "Price is required";
    if (price && isNaN(Number(price))) newErrors.price = "Price must be a valid number";
    if (!image) newErrors.image = "Main Image is required";

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
        athlete: form.athlete,
        subCategory: form.subCategory,
        serialNo: form.serialNo,
        certified,
        price: Number(price),
        rewardCoins: Number(form.rewardCoins) || 0,
        governance_state: form.governance_state,
        image: imageUrl,
        ownerHistory: ownerHistory.filter(x => x && x.trim() !== ""),
      };

      if (isEditMode) {
        const res = await axios.put(`/api/admin/store/addMerchandise?id=${editId}`, payload);
        if (res.data.success) {
          alert("Merchandise / Memorabilia updated successfully");
          router.push("/admin/store-management/merchandise/list");
        }
      } else {
        const res = await axios.post("/api/admin/store/addMerchandise", payload);
        if (res.data.success) {
          alert("Merchandise / Memorabilia created successfully");
          router.push("/admin/store-management/merchandise/list");

          handleCancel();
        }
      }
    } catch (error: unknown) {
      console.error("Error:", error);
      const serverMessage = axios.isAxiosError(error)
        ? (error.response?.data?.error || error.response?.data?.message || error.message)
        : error instanceof Error
          ? error.message
          : "Error saving merchandise";
      alert(serverMessage);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-6 text-white">Loading merchandise data...</div>;
  }

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">
          {isEditMode ? "Edit Merchandise / Memorabilia" : "Create Merchandise / Memorabilia"}
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
                value="memorabilia"
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-gray-500 cursor-not-allowed mt-1"
              />
            </div>

            <Input label="Title *" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Signed Match Jersey" error={errors.title} />
            <Input label="Athlete Name *" name="athlete" value={form.athlete} onChange={handleChange} placeholder="e.g. Murali Sreeshankar" error={errors.athlete} />

            <Select label="Subcategory *" name="subCategory" value={form.subCategory} onChange={handleChange} error={errors.subCategory}>
              <option value="">-- Select Subcategory --</option>
              <option value="Signed Jerseys">Signed Jerseys</option>
              <option value="Equipment">Equipment</option>
              <option value="Match-worn Gear">Match-worn Gear</option>
              <option value="Trophies & Medals">Trophies & Medals</option>
              <option value="Other">Other</option>
            </Select>

            <Input label="Serial Number (Unique ID) *" name="serialNo" value={form.serialNo} onChange={handleChange} placeholder="e.g. FIFA-2023-009A" error={errors.serialNo} />
            
            <div>
              <Input
                label="Price (Plain Number) *"
                type="number"
                name="price"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  if (errors.price) {
                    setErrors(prev => {
                      const next = { ...prev };
                      delete next.price;
                      return next;
                    });
                  }
                }}
                placeholder="e.g. 15000"
                error={errors.price}
              />
              {price && !isNaN(Number(price)) && (
                <span className="text-xs text-green-400 mt-1 block">
                  → {formatPriceString(price)}
                </span>
              )}
            </div>

            <Input label="Reward Coins" name="rewardCoins" type="number" value={form.rewardCoins} onChange={handleChange} />
            
            <Select label="Governance State" name="governance_state" value={form.governance_state} onChange={handleChange}>
              <option value="pending review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>

            <div className="flex items-center space-x-2 pt-6">
              <input
                type="checkbox"
                id="certified-toggle"
                checked={certified}
                onChange={(e) => setCertified(e.target.checked)}
                className="rounded bg-[#0d1117] border-gray-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="certified-toggle" className="text-xs text-gray-400 cursor-pointer select-none font-semibold">
                Certified authentic (provenance document included)
              </label>
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

        {/* OWNER HISTORY / PROVENANCE */}
        <div>
          <h2 className="text-md font-semibold text-white mb-4 border-b border-[#21262d] pb-2">Owner History & Provenance</h2>
          
          <div className="space-y-4">
            {ownerHistory.map((owner, i) => (
              <div key={i} className="flex flex-row gap-4 items-center">
                <div className="flex-1">
                  <input
                    placeholder={`Previous Owner ${i + 1} (e.g. Rahul Sharma)`}
                    value={owner}
                    onChange={(e) => updateOwner(i, e.target.value)}
                    className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeOwner(i)}
                  className="text-red-400 hover:text-red-500 text-sm font-semibold"
                >
                  ✕ Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addOwner}
            className="text-blue-400 text-sm bg-[#0d1117] px-4 py-2 mt-4 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
          >
            + Add Previous Owner History Row
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
            {loading ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update Merchandise" : "Create Merchandise")}
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
