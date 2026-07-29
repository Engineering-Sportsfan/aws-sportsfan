"use client";

import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes, useEffect } from "react";

/*  TYPES  */

interface Listing {
  title: string;
  type: string;
  price: string;
  preview: boolean;
}

interface FormState {
  name: string;
  discipline: string;
  bio: string;
  governance_state: "approved" | "pending review" | "rejected";
  rewardCoins: string;
}

/*  HELPERS  */

function formatPriceString(priceVal: string | number): string {
  const clean = String(priceVal).replace(/[^0-9]/g, "");
  const num = parseInt(clean, 10);
  if (isNaN(num)) return "";
  return "₹" + num.toLocaleString('en-IN');
}

/*  COMPONENT  */

export default function CreateAthlete() {
  const [form, setForm] = useState<FormState>({
    name: "",
    discipline: "",
    bio: "",
    governance_state: "pending review",
    rewardCoins: "0",
  });

  const [image, setImage] = useState<File | string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [listingErrors, setListingErrors] = useState<Record<number, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditMode = !!editId;

  useEffect(() => {
    if (editId) {
      setFetching(true);
      axios.get(`/api/admin/store/addAthlete?id=${editId}`)
        .then(res => {
          if (res.data.success && res.data.data) {
            const data = res.data.data;
            setForm({
              name: data.name || "",
              discipline: data.discipline || "",
              bio: data.bio || "",
              governance_state: data.governance_state || "pending review",
              rewardCoins: String(data.rewardCoins || "0"),
            });
            setImage(data.image || null);
            if (data.listings && Array.isArray(data.listings)) {
              setListings(data.listings.map((l: any) => ({
                title: l.title || "",
                type: l.type || "Video Course",
                price: String(l.price || "").replace(/[^0-9]/g, ""),
                preview: Boolean(l.preview),
              })));
            }
          }
        })
        .catch(err => {
          console.error("Failed to fetch athlete:", err);
          alert("Failed to load athlete data for editing.");
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

  /* DYNAMIC LISTS: LISTINGS */
  const addListing = () => {
    setListings((prev) => [...prev, { title: "", type: "Video Course", price: "", preview: false }]);
  };

  const updateListing = (i: number, key: keyof Listing, value: string | boolean) => {
    const updated = [...listings];
    updated[i] = { ...updated[i], [key]: value } as any;
    setListings(updated);

    if (listingErrors[i]?.[key]) {
      setListingErrors(prev => {
        const next = { ...prev };
        const row = { ...next[i] };
        delete row[key];
        if (Object.keys(row).length === 0) {
          delete next[i];
        } else {
          next[i] = row;
        }
        return next;
      });
    }
  };

  const removeListing = (i: number) => {
    setListings((prev) => prev.filter((_, idx) => idx !== i));
    setListingErrors(prev => {
      const next = { ...prev };
      delete next[i];
      // re-index remaining rows
      const reindexed: Record<number, Record<string, string>> = {};
      Object.keys(next).forEach(k => {
        const keyNum = parseInt(k, 10);
        if (keyNum > i) {
          reindexed[keyNum - 1] = next[keyNum];
        } else if (keyNum < i) {
          reindexed[keyNum] = next[keyNum];
        }
      });
      return reindexed;
    });
  };

  /* RESET */
  const handleCancel = () => {
    if (isEditMode) {
      router.push("/admin/store-management/athlete/list");
    } else {
      setForm({
        name: "",
        discipline: "",
        bio: "",
        governance_state: "pending review",
        rewardCoins: "0",
      });
      setImage(null);
      setListings([]);
      setErrors({});
      setListingErrors({});
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
    if (!form.name) newErrors.name = "Name is required";
    if (!form.discipline) newErrors.discipline = "Discipline is required";
    if (!form.bio) newErrors.bio = "Bio is required";
    if (!image) newErrors.image = "Main Image is required";

    const newListingErrors: Record<number, Record<string, string>> = {};
    listings.forEach((list, i) => {
      const row: Record<string, string> = {};
      if (!list.title) row.title = "Title is required";
      if (!list.type) row.type = "Type is required";
      if (!list.price) {
        row.price = "Price is required";
      } else if (!list.price.replace(/[^0-9]/g, "")) {
        row.price = "Price must be a positive number";
      }
      if (Object.keys(row).length > 0) {
        newListingErrors[i] = row;
      }
    });

    if (Object.keys(newErrors).length > 0 || Object.keys(newListingErrors).length > 0) {
      setErrors(newErrors);
      setListingErrors(newListingErrors);
      return;
    }

    setLoading(true);

    try {
      let imageUrl = image;
      if (image instanceof File) {
        imageUrl = await uploadFile(image, "Images");
      }

      const payload = {
        name: form.name,
        discipline: form.discipline,
        bio: form.bio,
        image: imageUrl,
        governance_state: form.governance_state,
        rewardCoins: Number(form.rewardCoins) || 0,
        listings: listings.map((item) => ({
          title: item.title,
          type: item.type,
          price: item.price.replace(/[^0-9]/g, ""),
          preview: item.preview,
        })),
      };

      if (isEditMode) {
        const res = await axios.put(`/api/admin/store/addAthlete?id=${editId}`, payload);
        if (res.data.success) {
          alert("Athlete updated successfully");
          router.push("/admin/store-management/athlete/list");
        }
      } else {
        const res = await axios.post("/api/admin/store/addAthlete", payload);
        if (res.data.success) {
          alert("Athlete created successfully");
          router.push("/admin/store-management/athlete/list");

          handleCancel();
        }
      }
    } catch (error: unknown) {
      console.error("Error:", error);
      const serverMessage = axios.isAxiosError(error)
        ? (error.response?.data?.error || error.response?.data?.message || error.message)
        : error instanceof Error
          ? error.message
          : "Error saving athlete";
      alert(serverMessage);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-6 text-white">Loading athlete data...</div>;
  }

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-lg font-semibold text-white">
          {isEditMode ? "Edit Athlete Profile" : "Create Athlete Profile"}
        </h1>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-8">
        
        {/* Validation Errors Box */}
        {(Object.keys(errors).length > 0 || Object.keys(listingErrors).length > 0) && (
          <div className="bg-red-900/30 border border-red-500/50 rounded p-4">
            <h3 className="text-red-400 text-sm font-semibold mb-1">Please fix the following validation errors:</h3>
            <ul className="list-disc pl-5 text-xs text-red-300">
              {Object.entries(errors).map(([key, val]) => (
                <li key={key}>{val}</li>
              ))}
              {Object.entries(listingErrors).map(([rowIndex, rowErrs]) => (
                <li key={rowIndex}>
                  Listing #{parseInt(rowIndex, 10) + 1}: {Object.values(rowErrs).join(", ")}
                </li>
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
                value="athletes"
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-gray-500 cursor-not-allowed mt-1"
              />
            </div>

            <Input label="Name *" name="name" value={form.name} onChange={handleChange} placeholder="e.g. Avinash Sable" error={errors.name} />
            <Input label="Discipline *" name="discipline" value={form.discipline} onChange={handleChange} placeholder="e.g. 3000m Steeplechase" error={errors.discipline} />
            <Input label="Reward Coins" name="rewardCoins" type="number" value={form.rewardCoins} onChange={handleChange} />

            <Select label="Governance State" name="governance_state" value={form.governance_state} onChange={handleChange}>
              <option value="pending review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>

            <div className="col-span-1 md:col-span-2">
              <Textarea label="Bio *" name="bio" value={form.bio} onChange={handleChange} placeholder="Asian Games silver medallist..." error={errors.bio} />
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

        {/* LISTINGS */}
        <div>
          <h2 className="text-md font-semibold text-white mb-4 border-b border-[#21262d] pb-2">Listings (Programs / Digital Products)</h2>
          
          <div className="space-y-4">
            {listings.map((item, i) => (
              <div key={i} className="bg-[#0d1117] border border-gray-700 rounded-lg p-4 relative space-y-4">
                <button
                  type="button"
                  onClick={() => removeListing(i)}
                  className="absolute top-2 right-2 text-red-400 hover:text-red-500 font-semibold"
                >
                  ✕ Remove
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <Input
                    label="Listing Title *"
                    value={item.title}
                    onChange={(e) => updateListing(i, "title", e.target.value)}
                    placeholder="e.g. Steeplechase Barrier Technique Series"
                    error={listingErrors[i]?.title}
                  />

                  <Select
                    label="Listing Type *"
                    value={item.type}
                    onChange={(e) => updateListing(i, "type", e.target.value)}
                    error={listingErrors[i]?.type}
                  >
                    <option value="Video Course">Video Course</option>
                    <option value="Training Program">Training Program</option>
                    <option value="Digital Download">Digital Download</option>
                  </Select>

                  <div>
                    <Input
                      label="Price (Plain Number) *"
                      type="text"
                      value={item.price}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9]/g, "");
                        updateListing(i, "price", clean);
                      }}
                      placeholder="e.g. 3299"
                      error={listingErrors[i]?.price}
                    />
                    {item.price && (
                      <span className="text-xs text-green-400 mt-1 block">
                        → {formatPriceString(item.price)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 pt-6">
                    <input
                      type="checkbox"
                      id={`preview-toggle-${i}`}
                      checked={item.preview}
                      onChange={(e) => updateListing(i, "preview", e.target.checked)}
                      className="rounded bg-[#0d1117] border-gray-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor={`preview-toggle-${i}`} className="text-xs text-gray-400 cursor-pointer select-none">
                      Allow free preview of this listing
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addListing}
            className="text-blue-400 text-sm bg-[#0d1117] px-4 py-2 mt-4 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
          >
            + Add Listing Row
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
            {loading ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update Athlete Profile" : "Create Athlete Profile")}
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
