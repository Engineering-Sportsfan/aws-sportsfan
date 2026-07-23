"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, useEffect } from "react";

/* TYPES */
interface Memento {
  label: string;
  price: number;
}

interface EventProduct {
  governance_state: string;
  title: string;
  subtitle: string;
  description: string;
  type: string;
  dates: string;
  icon: string;
  color: string;
  bg: string;
  badge: string;
  badgeColor: string;
  price: number | "";
  pricePaise: number | "";
  rewardCoins: number | "";
  seats: number | "";
  seatsLeft: number | "";
  perks: string[];
  memento: Memento;
}

/* COMPONENT */
export default function AddEventForm() {
  const [form, setForm] = useState<EventProduct>({
    governance_state: "approved",
    title: "",
    subtitle: "",
    description: "",
    type: "virtual",
    dates: "",
    icon: "Video",
    color: "#0ea5e9",
    bg: "rgba(14, 165, 233, 0.1)",
    badge: "",
    badgeColor: "#ff0000",
    price: "",
    pricePaise: "",
    rewardCoins: "",
    seats: "",
    seatsLeft: "",
    perks: [],
    memento: { label: "", price: 0 },
  });

  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [bgOverride, setBgOverride] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const router = useRouter();

  // Color to rgba helper
  const hexToRgba = (hex: string, alpha: number) => {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c = hex.substring(1).split('');
        if(c.length === 3){
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        const hexNum = parseInt(c.join(''), 16);
        return 'rgba('+[(hexNum>>16)&255, (hexNum>>8)&255, hexNum&255].join(',')+','+alpha+')';
    }
    return `rgba(0,0,0,${alpha})`;
  };

  useEffect(() => {
    if (!bgOverride && form.color) {
      setForm((prev) => ({ ...prev, bg: hexToRgba(form.color, 0.1) }));
    }
  }, [form.color, bgOverride]);

  useEffect(() => {
    if (form.price !== "") {
      setForm((prev) => ({ ...prev, pricePaise: Number(form.price) * 100 }));
    } else {
      setForm((prev) => ({ ...prev, pricePaise: "" }));
    }
  }, [form.price]);

  /* ---------------- INPUT ---------------- */
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  /*  PERKS  */
  const addPerk = () => {
    setForm((prev) => ({ ...prev, perks: [...prev.perks, ""] }));
  };
  const updatePerk = (i: number, val: string) => {
    const updated = [...form.perks];
    updated[i] = val;
    setForm((prev) => ({ ...prev, perks: updated }));
  };
  const removePerk = (i: number) => {
    setForm((prev) => ({ ...prev, perks: prev.perks.filter((_, idx) => idx !== i) }));
  };

  /*  RESET  */
  const handleCancel = () => {
    setForm({
      governance_state: "approved",
      title: "",
      subtitle: "",
      description: "",
      type: "virtual",
      dates: "",
      icon: "Video",
      color: "#0ea5e9",
      bg: "rgba(14, 165, 233, 0.1)",
      badge: "",
      badgeColor: "#ff0000",
      price: "",
      pricePaise: "",
      rewardCoins: "",
      seats: "",
      seatsLeft: "",
      perks: [],
      memento: { label: "", price: 0 },
    });
    setImage(null);
    setBgOverride(false);
    setErrors({});
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

  /*  SUBMIT  */
  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!form.title) newErrors.title = "Title is required";
    if (!form.subtitle) newErrors.subtitle = "Subtitle is required";
    if (!form.description) newErrors.description = "Description is required";
    if (!form.dates) newErrors.dates = "Dates is required";
    if (form.price === "") newErrors.price = "Price is required";
    if (form.seats === "") newErrors.seats = "Total Seats is required";
    if (form.seatsLeft === "") newErrors.seatsLeft = "Seats Left is required";
    if (!image) newErrors.image = "Main Image is required";

    if (form.seats !== "" && form.seatsLeft !== "") {
      if (Number(form.seatsLeft) > Number(form.seats)) {
        newErrors.seatsLeft = "Seats Left cannot be greater than Total Seats";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      const imageUrl = await uploadFile(image, "Images");

      const payload = {
        ...form,
        image: imageUrl,
        price: Number(form.price),
        rewardCoins: Number(form.rewardCoins) || 0,
        seats: Number(form.seats),
        seatsLeft: Number(form.seatsLeft),
      };

      const res = await axios.post("/api/admin/store/addEvent", payload);

      if (res.data.success) {
        alert("Event created successfully");
        handleCancel();
      }
    } catch (error: unknown) {
      console.error("Error:", error);
      const serverMessage = axios.isAxiosError(error)
          ? (error.response?.data?.error || error.response?.data?.message || error.message)
          : error instanceof Error
              ? error.message
              : "Error saving event";
      alert(serverMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">
          Create Event Product
        </h1>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
        
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

        {/* INPUTS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Title *" name="title" value={form.title} onChange={handleChange} error={errors.title} />
          <Input label="Subtitle *" name="subtitle" value={form.subtitle} onChange={handleChange} error={errors.subtitle} />
          <Input label="Dates (e.g. 24th - 26th July) *" name="dates" value={form.dates} onChange={handleChange} error={errors.dates} />
          
          <div>
            <label className="text-xs text-gray-400">Type *</label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1"
            >
              <option value="virtual">Virtual</option>
              <option value="physical">Physical</option>
            </select>
          </div>

          <Input label="Icon Name (e.g. Video, Calendar)" name="icon" value={form.icon} onChange={handleChange} />
          
          <div>
            <label className="text-xs text-gray-400">Accent Color</label>
            <input
              type="color"
              name="color"
              value={form.color}
              onChange={handleChange}
              className="w-full bg-[#0d1117] border border-gray-700 px-1 py-1 rounded cursor-pointer mt-1 h-[38px]"
            />
          </div>

          <div>
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-400">Background Color (rgba)</label>
              <div className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  id="bg-override"
                  checked={bgOverride}
                  onChange={(e) => setBgOverride(e.target.checked)}
                  className="rounded bg-[#0d1117] border-gray-700 w-3 h-3"
                />
                <label htmlFor="bg-override" className="text-[10px] text-gray-400">Override</label>
              </div>
            </div>
            <input
              name="bg"
              value={form.bg}
              onChange={handleChange}
              disabled={!bgOverride}
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <Input label="Badge Text" name="badge" value={form.badge} onChange={handleChange} />
          
          <div>
            <label className="text-xs text-gray-400">Badge Color</label>
            <input
              type="color"
              name="badgeColor"
              value={form.badgeColor}
              onChange={handleChange}
              className="w-full bg-[#0d1117] border border-gray-700 px-1 py-1 rounded cursor-pointer mt-1 h-[38px]"
            />
          </div>

          <Input label="Price (INR) *" type="number" name="price" value={form.price} onChange={handleChange} error={errors.price} />
          <Input label="Price Paise (Calculated)" type="number" readOnly value={form.pricePaise} />
          <Input label="Reward Coins" type="number" name="rewardCoins" value={form.rewardCoins} onChange={handleChange} />
          <Input label="Total Seats *" type="number" name="seats" value={form.seats} onChange={handleChange} error={errors.seats} />
          <Input label="Seats Left *" type="number" name="seatsLeft" value={form.seatsLeft} onChange={handleChange} error={errors.seatsLeft} />
          
          <div>
            <label className="text-xs text-gray-400">Governance State</label>
            <select
              name="governance_state"
              value={form.governance_state}
              onChange={handleChange}
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1"
            >
              <option value="approved">Approved</option>
              <option value="pending review">Pending Review</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="col-span-1 md:col-span-2">
            <FileInput label="Event Thumbnail Image *" onChange={setImage} error={errors.image} />
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className="text-xs text-gray-400">Description *</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Detail description..."
              className={`w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white min-h-[100px] focus:outline-none focus:border-blue-500 mt-1 ${
                errors.description ? "border-red-500" : "border-gray-700"
              }`}
            />
            {errors.description && <span className="text-red-500 text-xs mt-1 block">{errors.description}</span>}
          </div>
        </div>

        {/* MEMENTO */}
        <div className="border-t border-[#21262d] pt-6">
          <h2 className="text-sm font-semibold text-white mb-2">Memento Option</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#0d1117] p-4 rounded border border-gray-700">
            <Input
              label="Memento Label"
              value={form.memento.label}
              onChange={(e) => setForm((prev) => ({ ...prev, memento: { ...prev.memento, label: e.target.value } }))}
              placeholder="e.g. Event T-shirt"
            />
            <Input
              label="Memento Price (INR)"
              type="number"
              value={form.memento.price || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, memento: { ...prev.memento, price: Number(e.target.value) || 0 } }))}
              placeholder="e.g. 999"
            />
          </div>
        </div>

        {/* PERKS */}
        <div className="border-t border-[#21262d] pt-6">
          <h2 className="text-sm font-semibold text-white mb-2">Perks List</h2>
          {form.perks.map((perk, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <input
                value={perk}
                onChange={(e) => updatePerk(i, e.target.value)}
                className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                placeholder={`Perk ${i + 1}`}
              />
              <button
                onClick={() => removePerk(i)}
                className="text-red-400 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={addPerk}
            className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded mt-2 border border-gray-700"
          >
            + Add Perk
          </button>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3 pt-6 border-t border-[#21262d]">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 py-3 rounded font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Event"}
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 bg-gray-700 py-3 rounded font-semibold text-white hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* REUSABLE INPUTS */
type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        {...props}
        className={className || `w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white focus:outline-none mt-1 ${
          error ? "border-red-500" : "border-gray-700 focus:border-blue-500"
        }`}
      />
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
        className={`w-full text-sm text-white border rounded cursor-pointer bg-[#0d1117] px-3 py-2 mt-1 ${
          error ? "border-red-500" : "border-gray-700"
        }`}
      />
      {error && <span className="text-red-500 text-xs mt-1 block">{error}</span>}
    </div>
  );
}
