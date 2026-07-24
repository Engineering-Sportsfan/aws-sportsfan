"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/*  TYPES  */

interface Variant {
  size: string;
  stock: string;
}

interface FormState {
  brand: string;
  title: string;
  description: string;
  governance_state: "approved" | "pending review" | "rejected";
  rating: string;
  reviews: string;
  rewardCoins: string;
  originalPriceRupees: string;
  priceRupees: string;
}

/*  COMPONENT  */

export default function CreateBrandProduct() {
  const [form, setForm] = useState<FormState>({
    brand: "",
    title: "",
    description: "",
    governance_state: "pending review",
    rating: "0",
    reviews: "0",
    rewardCoins: "0",
    originalPriceRupees: "",
    priceRupees: "",
  });

  const [image, setImage] = useState<File | null>(null);
  const [isFeatured, setIsFeatured] = useState<boolean>(false);
  const [addTag, setAddTag] = useState<boolean>(false);
  const [tagLabel, setTagLabel] = useState<string>("");
  const [tagColor, setTagColor] = useState<string>("#CD620E");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [variantErrors, setVariantErrors] = useState<Record<number, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const getPreview = (file: File | null) => {
    if (file) return URL.createObjectURL(file);
    return "";
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

  /* DYNAMIC LISTS: VARIANTS */
  const addVariant = () => {
    setVariants((prev) => [...prev, { size: "", stock: "0" }]);
  };

  const updateVariant = (i: number, key: keyof Variant, value: string) => {
    const updated = [...variants];
    updated[i] = { ...updated[i], [key]: value };
    setVariants(updated);

    if (variantErrors[i]?.[key]) {
      setVariantErrors(prev => {
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

  const removeVariant = (i: number) => {
    setVariants((prev) => prev.filter((_, idx) => idx !== i));
    setVariantErrors(prev => {
      const next = { ...prev };
      delete next[i];
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
    setForm({
      brand: "",
      title: "",
      description: "",
      governance_state: "pending review",
      rating: "0",
      reviews: "0",
      rewardCoins: "0",
      originalPriceRupees: "",
      priceRupees: "",
    });
    setImage(null);
    setIsFeatured(false);
    setAddTag(false);
    setTagLabel("");
    setTagColor("#CD620E");
    setVariants([]);
    setErrors({});
    setVariantErrors({});
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
    if (!form.brand) newErrors.brand = "Brand is required";
    if (!form.title) newErrors.title = "Title is required";
    if (!form.description) newErrors.description = "Description is required";
    if (!form.originalPriceRupees) newErrors.originalPriceRupees = "Original Price is required";
    if (!form.priceRupees) newErrors.priceRupees = "Sale Price is required";
    if (!image) newErrors.image = "Main Image is required";

    if (form.originalPriceRupees && form.priceRupees) {
      const originalPriceVal = Number(form.originalPriceRupees) * 100;
      const pricePaise = Number(form.priceRupees) * 100;
      if (pricePaise > originalPriceVal) {
        newErrors.priceRupees = "Sale price cannot be higher than original price";
      }
    }

    const newVariantErrors: Record<number, Record<string, string>> = {};
    variants.forEach((v, i) => {
      const row: Record<string, string> = {};
      if (!v.size) row.size = "Size is required";
      if (v.stock === undefined || v.stock === "") {
        row.stock = "Stock count is required";
      } else if (!v.stock.replace(/[^0-9]/g, "")) {
        row.stock = "Stock must be a non-negative integer";
      }
      if (Object.keys(row).length > 0) {
        newVariantErrors[i] = row;
      }
    });

    if (Object.keys(newErrors).length > 0 || Object.keys(newVariantErrors).length > 0) {
      setErrors(newErrors);
      setVariantErrors(newVariantErrors);
      return;
    }

    setLoading(true);

    try {
      const imageUrl = await uploadFile(image, "Images");

      const payload = {
        brand: form.brand,
        title: form.title,
        description: form.description,
        image: imageUrl,
        governance_state: form.governance_state,
        isFeatured,
        rating: Number(form.rating) || 0,
        reviews: Number(form.reviews) || 0,
        rewardCoins: Number(form.rewardCoins) || 0,
        originalPriceRupees: Number(form.originalPriceRupees),
        priceRupees: Number(form.priceRupees),
        addTag,
        tag: {
          label: tagLabel,
          color: tagColor,
        },
        variants: variants.map((v) => ({
          size: v.size,
          stock: Number(v.stock) || 0,
        })),
      };

      const res = await axios.post("/api/admin/store/addBrand", payload);

      if (res.data.success) {
        alert("Brand product created successfully");
        handleCancel();
      }
    } catch (error: unknown) {
      console.error("Error:", error);
      const serverMessage = axios.isAxiosError(error)
        ? (error.response?.data?.error || error.response?.data?.message || error.message)
        : error instanceof Error
          ? error.message
          : "Error saving brand product";
      alert(serverMessage);
    } finally {
      setLoading(false);
    }
  };

  const liveTotalStock = variants.reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);
  const showPriceWarning = (Number(form.priceRupees) || 0) > (Number(form.originalPriceRupees) || 0);

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">
          Create Brand Product
        </h1>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-8">
        
        {/* Validation Errors Box */}
        {(Object.keys(errors).length > 0 || Object.keys(variantErrors).length > 0) && (
          <div className="bg-red-900/30 border border-red-500/50 rounded p-4">
            <h3 className="text-red-400 text-sm font-semibold mb-1">Please fix the following validation errors:</h3>
            <ul className="list-disc pl-5 text-xs text-red-300">
              {Object.entries(errors).map(([key, val]) => (
                <li key={key}>{val}</li>
              ))}
              {Object.entries(variantErrors).map(([rowIndex, rowErrs]) => (
                <li key={rowIndex}>
                  Variant #{parseInt(rowIndex, 10) + 1}: {Object.values(rowErrs).join(", ")}
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
                value="brands"
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-gray-500 cursor-not-allowed mt-1"
              />
            </div>

            {/* Fixed Currency Input */}
            <div>
              <label className="text-xs text-gray-400">Currency (Fixed)</label>
              <input
                readOnly
                value="INR"
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-gray-500 cursor-not-allowed mt-1"
              />
            </div>

            <Input label="Brand *" name="brand" value={form.brand} onChange={handleChange} placeholder="e.g. ASICS Run" error={errors.brand} />
            <Input label="Title *" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Gel-Nimbus 25 Marathon Edition" error={errors.title} />
            
            <Input label="Rating" name="rating" type="number" step="0.1" value={form.rating} onChange={handleChange} placeholder="e.g. 4.5" />
            <Input label="Reviews" name="reviews" type="number" value={form.reviews} onChange={handleChange} placeholder="e.g. 120" />
            <Input label="Reward Coins" name="rewardCoins" type="number" value={form.rewardCoins} onChange={handleChange} />
            
            <Select label="Governance State" name="governance_state" value={form.governance_state} onChange={handleChange}>
              <option value="pending review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>

            <div className="col-span-1 md:col-span-2">
              <Textarea label="Description *" name="description" value={form.description} onChange={handleChange} placeholder="Premium cushioned running shoes..." error={errors.description} />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="featured-toggle"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="rounded bg-[#0d1117] border-gray-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="featured-toggle" className="text-xs text-gray-400 cursor-pointer select-none">
                Show as featured product
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

        {/* PRICING & PROMOTIONS */}
        <div>
          <h2 className="text-md font-semibold text-white mb-4 border-b border-[#21262d] pb-2">Pricing & Promotions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input label="Original Price (INR) *" name="originalPriceRupees" type="number" value={form.originalPriceRupees} onChange={handleChange} placeholder="e.g. 18999" error={errors.originalPriceRupees} />
              {form.originalPriceRupees && (
                <span className="text-xs text-gray-500 mt-1 block">
                  → {(Number(form.originalPriceRupees) * 100).toLocaleString('en-IN')} Paise
                </span>
              )}
            </div>

            <div>
              <Input label="Sale Price (INR) *" name="priceRupees" type="number" value={form.priceRupees} onChange={handleChange} placeholder="e.g. 14999" error={errors.priceRupees} />
              {form.priceRupees && (
                <span className="text-xs text-gray-500 mt-1 block">
                  → {(Number(form.priceRupees) * 100).toLocaleString('en-IN')} Paise
                </span>
              )}
              {showPriceWarning && (
                <p className="text-red-500 text-xs mt-1">Sale price cannot be higher than original price.</p>
              )}
            </div>

            <div className="col-span-1 md:col-span-2 flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="tag-toggle"
                checked={addTag}
                onChange={(e) => setAddTag(e.target.checked)}
                className="rounded bg-[#0d1117] border-gray-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="tag-toggle" className="text-xs text-gray-400 cursor-pointer select-none">
                Add promotional tag (e.g. Flash Sale / Hot Discount)
              </label>
            </div>

            {addTag && (
              <>
                <Input label="Tag Label" name="tagLabel" value={tagLabel} onChange={(e) => setTagLabel(e.target.value)} placeholder="e.g. Flash Sale" />
                <div>
                  <label className="text-xs text-gray-400">Tag Color</label>
                  <input
                    type="color"
                    value={tagColor}
                    onChange={(e) => setTagColor(e.target.value)}
                    className="w-full h-[38px] bg-[#0d1117] border border-gray-700 px-1 py-1 rounded cursor-pointer mt-1"
                  />
                </div>
              </>
            )}

          </div>
        </div>

        {/* VARIANTS & INVENTORY */}
        <div>
          <h2 className="text-md font-semibold text-white mb-4 border-b border-[#21262d] pb-2">Variants & Inventory</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-400">Total Stock (Auto-calculated)</label>
              <input
                readOnly
                value={liveTotalStock}
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-gray-500 cursor-not-allowed mt-1"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-400">Inventory Status (Auto-calculated)</label>
              <input
                readOnly
                value={liveTotalStock > 0 ? "Available (In Stock)" : "Out of Stock"}
                className={`w-full border border-gray-700 px-3 py-2 rounded text-sm font-semibold mt-1 ${liveTotalStock > 0 ? "bg-[rgba(0,200,100,0.05)] text-green-400" : "bg-[rgba(255,0,0,0.05)] text-red-400"}`}
              />
            </div>
          </div>

          <div className="space-y-4">
            {variants.map((variant, i) => {
              const variantId = variant.size.toLowerCase().replace(/\s+/g, "");

              return (
                <div key={i} className="bg-[#0d1117] border border-gray-700 rounded-lg p-4 relative space-y-4">
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    className="absolute top-2 right-2 text-red-400 hover:text-red-500 font-semibold"
                  >
                    ✕ Remove
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <Input
                      label="Size (e.g. UK 7 / Medium) *"
                      value={variant.size}
                      onChange={(e) => updateVariant(i, "size", e.target.value)}
                      placeholder="e.g. UK 7"
                      error={variantErrors[i]?.size}
                    />

                    <Input
                      label="Stock Count *"
                      type="number"
                      value={variant.stock}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9]/g, "");
                        updateVariant(i, "stock", clean);
                      }}
                      placeholder="e.g. 25"
                      error={variantErrors[i]?.stock}
                    />

                    <div>
                      <label className="text-xs text-gray-400">Variant ID / Available (Auto-derived)</label>
                      <div className="text-xs text-gray-500 mt-2 bg-[rgba(255,255,255,0.02)] px-2 py-1 rounded border border-gray-800">
                        ID: <span className="text-white font-mono">{variantId || "(auto)"}</span> | Status: <span className={Number(variant.stock) > 0 ? "text-green-400" : "text-red-400"}>{Number(variant.stock) > 0 ? "Active" : "Out of Stock"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addVariant}
            className="text-blue-400 text-sm bg-[#0d1117] px-4 py-2 mt-4 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
          >
            + Add Size Variant
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
            {loading ? "Creating..." : "Create Brand Product"}
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
