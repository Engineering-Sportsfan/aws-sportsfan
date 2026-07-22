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
    if (
      !form.title ||
      !form.subtitle ||
      !form.description ||
      !form.type ||
      !form.dates ||
      form.price === "" ||
      form.seats === ""
    ) {
      alert("Required fields missing");
      return;
    }
    
    if (form.seatsLeft === "") {
        alert("Please specify seats left");
        return;
    }

    if (Number(form.seatsLeft) > Number(form.seats)) {
      alert("Seats Left cannot be greater than Total Seats");
      return;
    }

    if (!image) {
      alert("Main Image is required");
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
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Title" name="title" value={form.title} onChange={handleChange} />
          <Input label="Subtitle" name="subtitle" value={form.subtitle} onChange={handleChange} />
          <Input label="Dates (e.g. Oct 6-12, 2025)" name="dates" value={form.dates} onChange={handleChange} />
          <div>
            <label className="text-xs text-gray-400">Governance State</label>
            <select
              name="governance_state"
              value={form.governance_state}
              onChange={handleChange}
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
            >
              <option value="approved">Approved</option>
              <option value="pending review">Pending Review</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">Type</label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
            >
              <option value="virtual">Virtual</option>
              <option value="in-person">In-Person</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">Icon</label>
            <select
              name="icon"
              value={form.icon}
              onChange={handleChange}
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
            >
              <option value="Video">Video</option>
              <option value="Zap">Zap</option>
              <option value="Calendar">Calendar</option>
              <option value="Star">Star</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-400">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
            />
          </div>
        </div>

        {/* Pricing & Seats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#21262d] pt-6">
          <Input type="number" label="Price (Rupees)" name="price" value={form.price} onChange={handleChange} />
          <Input label="Price Paise (Auto-calculated)" name="pricePaise" value={form.pricePaise} readOnly disabled className="w-full bg-[#1c2128] border border-gray-700 px-3 py-2 rounded text-sm text-gray-400 cursor-not-allowed" />
          <Input type="number" label="Reward Coins" name="rewardCoins" value={form.rewardCoins} onChange={handleChange} />
          <div></div>
          <Input type="number" label="Total Seats" name="seats" value={form.seats} onChange={handleChange} />
          <div>
              <Input type="number" label="Seats Left" name="seatsLeft" value={form.seatsLeft} onChange={handleChange} />
              {form.seatsLeft !== "" && form.seats !== "" && Number(form.seatsLeft) > Number(form.seats) && (
                  <p className="text-red-500 text-xs mt-1">Seats left cannot exceed total seats.</p>
              )}
          </div>
        </div>

        {/* Appearance & Badge */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[#21262d] pt-6">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Color (Hex)</label>
            <div className="flex items-center gap-2">
                <input type="color" name="color" value={form.color} onChange={handleChange} className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0" />
                <input type="text" name="color" value={form.color} onChange={handleChange} className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 flex justify-between items-center mb-1">
                <span>Background (RGBA)</span>
                <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={bgOverride} onChange={(e) => setBgOverride(e.target.checked)} />
                    <span>Override</span>
                </label>
            </label>
            <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded border border-gray-700" style={{ backgroundColor: form.bg }}></div>
                <input type="text" name="bg" value={form.bg} onChange={handleChange} readOnly={!bgOverride} className={`flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm ${!bgOverride ? "text-gray-500 cursor-not-allowed" : "text-white"}`} />
            </div>
          </div>
          <div></div>
          
          <Input label="Badge Text (Optional)" name="badge" value={form.badge} onChange={handleChange} />
          {form.badge && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Badge Color (Hex)</label>
              <div className="flex items-center gap-2">
                  <input type="color" name="badgeColor" value={form.badgeColor} onChange={handleChange} className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0" />
                  <input type="text" name="badgeColor" value={form.badgeColor} onChange={handleChange} className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
              </div>
            </div>
          )}
        </div>

        {/* Memento & Image */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#21262d] pt-6">
            <div>
                <FileInput label="Main Image" onChange={setImage} />
                {image && (
                    <img
                        src={URL.createObjectURL(image)}
                        alt="preview"
                        className="w-24 h-24 object-cover mt-2 rounded border border-gray-700"
                    />
                )}
            </div>
            <div>
                <h2 className="text-sm text-gray-300 mb-2">Memento (Optional)</h2>
                <div className="grid grid-cols-2 gap-2">
                    <Input label="Label" name="mementoLabel" value={form.memento.label} onChange={(e) => setForm(p => ({ ...p, memento: { ...p.memento, label: e.target.value } }))} />
                    <Input type="number" label="Price" name="mementoPrice" value={form.memento.price === 0 ? "" : form.memento.price} onChange={(e) => setForm(p => ({ ...p, memento: { ...p.memento, price: Number(e.target.value) || 0 } }))} />
                </div>
            </div>
        </div>

        {/* PERKS */}
        <div className="border-t border-[#21262d] pt-6">
          <h2 className="text-sm text-gray-300 mb-2">Perks (Optional)</h2>
          {form.perks.map((perk, i) => (
            <div key={i} className="flex items-center gap-4 mb-2">
              <input
                placeholder={`Perk ${i + 1}`}
                value={perk}
                onChange={(e) => updatePerk(i, e.target.value)}
                className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
              />
              <button
                onClick={() => removePerk(i)}
                className="text-red-400 hover:text-red-500 text-lg"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={addPerk}
            className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded mt-2"
          >
            Add Perk
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
};

function Input({ label, className, ...props }: InputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        {...props}
        className={className || "w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"}
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
