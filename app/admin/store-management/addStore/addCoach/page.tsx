"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes } from "react";

/* TYPES */
type FormState = {
  coachId: string;
  name: string;
  title: string;
  role: string;
  tagline: string;
  about: string;
  category: string;
  experience: string;
  pricePaise: number | "";
  rating: number | "";
  reviews: number | "";
  rewardCoins: number | "";
  verified: boolean;
  governance_state: string;
  sourcing_model: string;
};

type Service = {
  title: string;
  desc: string;
  duration: string;
  pricePaise: number | "";
};

type Review = {
  user: string;
  rating: number | "";
  comment: string;
  date: string;
};

type Slot = {
  date: string;
  day: string;
  time: string;
  num: number | "";
  status: string;
};

/* COMPONENT */
export default function AddCoachForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<FormState>({
    coachId: "",
    name: "",
    title: "",
    role: "",
    tagline: "",
    about: "",
    category: "coaches",
    experience: "",
    pricePaise: "",
    rating: "",
    reviews: "",
    rewardCoins: "",
    verified: false,
    governance_state: "approved",
    sourcing_model: "independent",
  });

  const [image, setImage] = useState<File | null>(null);
  
  const [achievements, setAchievements] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [specializations, setSpecializations] = useState<string[]>([]);
  
  const [services, setServices] = useState<Service[]>([]);
  const [reviewList, setReviewList] = useState<Review[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  /* ---------------- INPUT ---------------- */
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    let parsedValue: string | number | boolean = value;
    if (type === "checkbox") {
      parsedValue = (e.target as HTMLInputElement).checked;
    }

    setForm((prev) => ({ ...prev, [name]: parsedValue }));
  };

  /* DYNAMIC LISTS: STRINGS */
  const updateStringList = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    list: string[],
    index: number,
    value: string
  ) => {
    const newList = [...list];
    newList[index] = value;
    setter(newList);
  };

  const removeStringList = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    list: string[],
    index: number
  ) => {
    setter(list.filter((_, i) => i !== index));
  };

  const addStringList = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => [...prev, ""]);
  };

  /* DYNAMIC LISTS: SERVICES */
  const addService = () => {
    setServices((prev) => [...prev, { title: "", desc: "", duration: "", pricePaise: "" }]);
  };
  const updateService = (i: number, key: keyof Service, value: string | number) => {
    const updated = [...services];
    updated[i] = { ...updated[i], [key]: value };
    setServices(updated);
  };
  const removeService = (i: number) => setServices((prev) => prev.filter((_, idx) => idx !== i));

  /* DYNAMIC LISTS: REVIEWS */
  const addReview = () => {
    setReviewList((prev) => [...prev, { user: "", rating: "", comment: "", date: "" }]);
  };
  const updateReview = (i: number, key: keyof Review, value: string | number) => {
    const updated = [...reviewList];
    updated[i] = { ...updated[i], [key]: value };
    setReviewList(updated);
  };
  const removeReview = (i: number) => setReviewList((prev) => prev.filter((_, idx) => idx !== i));

  /* DYNAMIC LISTS: SLOTS */
  const addSlot = () => {
    setSlots((prev) => [...prev, { date: "", day: "", time: "", num: "", status: "available" }]);
  };
  const updateSlot = (i: number, key: keyof Slot, value: string | number) => {
    const updated = [...slots];
    updated[i] = { ...updated[i], [key]: value };
    
    // Auto-derive day if date changes
    if (key === "date" && typeof value === "string" && value) {
        const dateObj = new Date(value);
        if (!isNaN(dateObj.getTime())) {
            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            updated[i].day = days[dateObj.getDay()];
        }
    }
    
    setSlots(updated);
  };
  const removeSlot = (i: number) => setSlots((prev) => prev.filter((_, idx) => idx !== i));

  /* RESET */
  const handleCancel = () => {
    setForm({
      coachId: "", name: "", title: "", role: "", tagline: "", about: "", category: "coaches",
      experience: "", pricePaise: "", rating: "", reviews: "", rewardCoins: "",
      verified: false, governance_state: "approved", sourcing_model: "independent",
    });
    setImage(null);
    setAchievements([]);
    setCertifications([]);
    setSpecializations([]);
    setServices([]);
    setReviewList([]);
    setSlots([]);
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
    if (!form.coachId || !form.name || !form.title) {
      alert("Required fields missing (Coach ID, Name, Title)");
      return;
    }

    setLoading(true);

    try {
      let imageUrl = "";
      if (image) {
        imageUrl = await uploadFile(image, "Images");
      }

      const payload = {
        ...form,
        image: imageUrl,
        pricePaise: Number(form.pricePaise),
        rating: Number(form.rating),
        reviews: Number(form.reviews),
        rewardCoins: Number(form.rewardCoins),
        achievements: achievements.filter(a => a.trim() !== ""),
        certifications: certifications.filter(c => c.trim() !== ""),
        specializations: specializations.filter(s => s.trim() !== ""),
        services: services.map(s => ({ ...s, pricePaise: Number(s.pricePaise) })),
        reviewList: reviewList.map(r => ({ ...r, rating: Number(r.rating) })),
        slots: slots.map(s => ({ ...s, num: Number(s.num) })),
      };

      const res = await axios.post("/api/admin/store/addCoach", payload);

      if (res.data.success) {
        alert("Coach created successfully");
        handleCancel();
      }
    } catch (error: unknown) {
      console.error("Error:", error);
      const serverMessage = axios.isAxiosError(error)
        ? (error.response?.data?.error || error.response?.data?.message || error.message)
        : error instanceof Error
          ? error.message
          : "Error saving coach";
      alert(serverMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Add New Coach</h1>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
        
        {/* Core Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Coach ID *" name="coachId" value={form.coachId} onChange={handleChange} />
          <Input label="Name *" name="name" value={form.name} onChange={handleChange} />
          <Input label="Title *" name="title" value={form.title} onChange={handleChange} />
          <Input label="Role" name="role" value={form.role} onChange={handleChange} />
          <Input label="Tagline" name="tagline" value={form.tagline} onChange={handleChange} />
          <Input label="Category" name="category" value={form.category} onChange={handleChange} readOnly/>
          <Input label="Experience" name="experience" value={form.experience} onChange={handleChange} />
          <Input label="Price (in Paise)" type="number" name="pricePaise" value={form.pricePaise} onChange={handleChange} />
          <Input label="Rating" type="number" step="0.1" name="rating" value={form.rating} onChange={handleChange} />
          <Input label="Reviews Count" type="number" name="reviews" value={form.reviews} onChange={handleChange} />
          <Input label="Reward Coins" type="number" name="rewardCoins" value={form.rewardCoins} onChange={handleChange} />
        </div>

        <div>
            <label className="text-xs text-gray-400">About</label>
            <textarea
                name="about"
                value={form.about}
                onChange={handleChange}
                rows={4}
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label className="text-xs text-gray-400 mb-1 block">Governance State</label>
                <select name="governance_state" value={form.governance_state} onChange={handleChange} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white">
                    <option value="approved">Approved</option>
                    <option value="pending review">Pending Review</option>
                    <option value="rejected">Rejected</option>
                </select>
            </div>
            <div>
                <label className="text-xs text-gray-400 mb-1 block">Sourcing Model</label>
                <select name="sourcing_model" value={form.sourcing_model} onChange={handleChange} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white">
                    <option value="independent">Independent</option>
                    <option value="agency">Agency</option>
                    <option value="in-house">In-house</option>
                </select>
            </div>
            <div className="flex items-center mt-6">
                <input type="checkbox" name="verified" checked={form.verified} onChange={handleChange} className="mr-2 h-4 w-4" />
                <label className="text-sm text-gray-300">Verified</label>
            </div>
        </div>

        {/* IMAGE */}
        <div>
          <FileInput label="Image Profile" onChange={setImage} />
          {image && (
            <img src={URL.createObjectURL(image)} alt="preview" className="w-24 h-24 object-cover mt-2 rounded border" />
          )}
        </div>

        {/* String Arrays */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StringListSection title="Achievements" list={achievements} setter={setAchievements} updateFn={updateStringList} removeFn={removeStringList} addFn={addStringList} />
            <StringListSection title="Certifications" list={certifications} setter={setCertifications} updateFn={updateStringList} removeFn={removeStringList} addFn={addStringList} />
            <StringListSection title="Specializations" list={specializations} setter={setSpecializations} updateFn={updateStringList} removeFn={removeStringList} addFn={addStringList} />
        </div>

        {/* SERVICES */}
        <div>
            <h2 className="text-sm text-gray-300 mb-2">Services</h2>
            {services.map((svc, i) => (
                <div key={i} className="bg-[#0d1117] p-4 rounded border border-gray-700 mb-4 relative">
                    <button onClick={() => removeService(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-500 text-lg">✕</button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                        <input placeholder="Service Title" value={svc.title} onChange={(e) => updateService(i, "title", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                        <input placeholder="Duration (e.g. 60 mins)" value={svc.duration} onChange={(e) => updateService(i, "duration", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                        <input type="number" placeholder="Price (Paise)" value={svc.pricePaise} onChange={(e) => updateService(i, "pricePaise", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                    </div>
                    <textarea placeholder="Service Description" value={svc.desc} onChange={(e) => updateService(i, "desc", e.target.value)} rows={2} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                </div>
            ))}
            <button onClick={addService} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700">Add Service</button>
        </div>

        {/* REVIEW LIST */}
        <div>
            <h2 className="text-sm text-gray-300 mb-2">Reviews</h2>
            {reviewList.map((rev, i) => (
                <div key={i} className="bg-[#0d1117] p-4 rounded border border-gray-700 mb-4 relative">
                    <button onClick={() => removeReview(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-500 text-lg">✕</button>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                        <input placeholder="User Name" value={rev.user} onChange={(e) => updateReview(i, "user", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                        <input type="number" placeholder="Rating (1-5)" value={rev.rating} onChange={(e) => updateReview(i, "rating", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                        <input type="date" value={rev.date} onChange={(e) => updateReview(i, "date", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                    </div>
                    <textarea placeholder="Comment" value={rev.comment} onChange={(e) => updateReview(i, "comment", e.target.value)} rows={2} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                </div>
            ))}
            <button onClick={addReview} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700">Add Review</button>
        </div>

        {/* SLOTS */}
        <div>
            <h2 className="text-sm text-gray-300 mb-2">Slots (Subcollection)</h2>
            {slots.map((slot, i) => (
                <div key={i} className="bg-[#0d1117] p-4 rounded border border-gray-700 mb-4 relative">
                    <button onClick={() => removeSlot(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-500 text-lg">✕</button>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-2 pr-8">
                        <input type="date" value={slot.date} onChange={(e) => updateSlot(i, "date", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" title="Date" />
                        <input placeholder="Day (auto)" value={slot.day} readOnly className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-gray-400" />
                        <input type="time" value={slot.time} onChange={(e) => updateSlot(i, "time", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" title="Time" />
                        <input type="number" placeholder="Capacity (num)" value={slot.num} onChange={(e) => updateSlot(i, "num", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                        <select value={slot.status} onChange={(e) => updateSlot(i, "status", e.target.value)} className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white">
                            <option value="available">Available</option>
                            <option value="booked">Booked</option>
                            <option value="locked">Locked</option>
                        </select>
                    </div>
                </div>
            ))}
            <button onClick={addSlot} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700">Add Slot</button>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3">
          <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-blue-600 py-3 rounded font-semibold text-white">
            {loading ? "Creating..." : "Create Coach"}
          </button>
          <button onClick={handleCancel} className="flex-1 bg-gray-700 py-3 rounded font-semibold text-white">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* REUSABLE INPUTS */
type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; };
function Input({ label, ...props }: InputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input {...props} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
    </div>
  );
}

type FileInputProps = { label: string; onChange: (file: File | null) => void; };
function FileInput({ label, onChange }: FileInputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input type="file" onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="w-full text-sm text-white border border-gray-700 rounded cursor-pointer bg-[#0d1117] px-3 py-2" />
    </div>
  );
}

/* STRING LIST SECTION HELPER */
function StringListSection({ 
    title, list, setter, updateFn, removeFn, addFn 
}: { 
    title: string, 
    list: string[], 
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    updateFn: any, 
    removeFn: any, 
    addFn: any 
}) {
    return (
        <div>
            <h2 className="text-sm text-gray-300 mb-2">{title}</h2>
            {list.map((item, i) => (
                <div key={i} className="flex flex-row mb-2">
                    <input value={item} onChange={(e) => updateFn(setter, list, i, e.target.value)} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white" />
                    <button onClick={() => removeFn(setter, list, i)} className="text-red-400 hover:text-red-500 text-lg ml-2">✕</button>
                </div>
            ))}
            <button onClick={() => addFn(setter)} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-1 rounded border border-gray-700 mt-1">Add {title}</button>
        </div>
    );
}
