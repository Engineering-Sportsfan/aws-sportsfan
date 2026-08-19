"use client";

import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, useEffect } from "react";

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
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditMode = !!editId;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

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

  const [image, setImage] = useState<File | string | null>(null);
  
  const [achievements, setAchievements] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [specializations, setSpecializations] = useState<string[]>([]);
  
  const [services, setServices] = useState<Service[]>([]);
  const [reviewList, setReviewList] = useState<Review[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serviceErrors, setServiceErrors] = useState<Record<number, Record<string, string>>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<number, Record<string, string>>>({});
  const [slotErrors, setSlotErrors] = useState<Record<number, Record<string, string>>>({});

  useEffect(() => {
    if (editId) {
      setFetching(true);
      axios.get(`/api/admin/store/addCoach?id=${editId}`)
        .then(res => {
          if (res.data.success && res.data.data) {
            const data = res.data.data;
            setForm({
              coachId: data.coachId || "",
              name: data.name || "",
              title: data.title || "",
              role: data.role || "",
              tagline: data.tagline || "",
              about: data.about || "",
              category: data.category || "coaches",
              experience: data.experience || "",
              pricePaise: data.pricePaise ?? "",
              rating: data.rating ?? "",
              reviews: data.reviews ?? "",
              rewardCoins: data.rewardCoins ?? "",
              verified: Boolean(data.verified),
              governance_state: data.governance_state || "approved",
              sourcing_model: data.sourcing_model || "independent",
            });
            setImage(data.image || null);
            setAchievements(data.achievements || []);
            setCertifications(data.certifications || []);
            setSpecializations(data.specializations || []);
            setServices(data.services || []);
            setReviewList(data.reviewList || []);
            setSlots(data.slots || []);
          }
        })
        .catch(err => {
          console.error("Failed to fetch coach:", err);
          alert("Failed to load coach data for editing.");
        })
        .finally(() => {
          setFetching(false);
        });
    }
  }, [editId]);

  /* ---------------- INPUT ---------------- */
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    let parsedValue: string | number | boolean = value;
    if (type === "checkbox") {
      parsedValue = (e.target as HTMLInputElement).checked;
    }

    setForm((prev) => ({ ...prev, [name]: parsedValue }));

    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
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

    if (serviceErrors[i]?.[key]) {
      setServiceErrors(prev => {
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
  const removeService = (i: number) => {
    setServices((prev) => prev.filter((_, idx) => idx !== i));
    setServiceErrors(prev => {
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

  /* DYNAMIC LISTS: REVIEWS */
  const addReview = () => {
    setReviewList((prev) => [...prev, { user: "", rating: "", comment: "", date: "" }]);
  };
  const updateReview = (i: number, key: keyof Review, value: string | number) => {
    const updated = [...reviewList];
    updated[i] = { ...updated[i], [key]: value };
    setReviewList(updated);

    if (reviewErrors[i]?.[key]) {
      setReviewErrors(prev => {
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
  const removeReview = (i: number) => {
    setReviewList((prev) => prev.filter((_, idx) => idx !== i));
    setReviewErrors(prev => {
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
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            updated[i].day = days[dateObj.getDay()];
        }
    }
    
    setSlots(updated);

    if (slotErrors[i]?.[key]) {
      setSlotErrors(prev => {
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
  const removeSlot = (i: number) => {
    setSlots((prev) => prev.filter((_, idx) => idx !== i));
    setSlotErrors(prev => {
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
    if (isEditMode) {
      router.push("/admin/store-management/coach/list");
    } else {
      setForm({
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
      setImage(null);
      setAchievements([]);
      setCertifications([]);
      setSpecializations([]);
      setServices([]);
      setReviewList([]);
      setSlots([]);
      setErrors({});
      setServiceErrors({});
      setReviewErrors({});
      setSlotErrors({});
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
    if (!form.coachId) newErrors.coachId = "Coach ID is required";
    if (!form.name) newErrors.name = "Name is required";
    if (!form.title) newErrors.title = "Title/Role Title is required";
    if (!image) newErrors.image = "Coach Image is required";

    const newServiceErrors: Record<number, Record<string, string>> = {};
    services.forEach((s, i) => {
      const row: Record<string, string> = {};
      if (!s.title) row.title = "Title is required";
      if (!s.duration) row.duration = "Duration is required";
      if (s.pricePaise === undefined || s.pricePaise === "") {
        row.pricePaise = "Price is required";
      }
      if (Object.keys(row).length > 0) {
        newServiceErrors[i] = row;
      }
    });

    const newReviewErrors: Record<number, Record<string, string>> = {};
    reviewList.forEach((r, i) => {
      const row: Record<string, string> = {};
      if (!r.user) row.user = "User name is required";
      if (r.rating === undefined || r.rating === "") {
        row.rating = "Rating is required";
      }
      if (Object.keys(row).length > 0) {
        newReviewErrors[i] = row;
      }
    });

    const newSlotErrors: Record<number, Record<string, string>> = {};
    slots.forEach((slot, i) => {
      const row: Record<string, string> = {};
      if (!slot.date) row.date = "Date is required";
      if (!slot.time) row.time = "Time is required";
      if (slot.num === undefined || slot.num === "") {
        row.num = "Capacity is required";
      }
      if (Object.keys(row).length > 0) {
        newSlotErrors[i] = row;
      }
    });

    if (
      Object.keys(newErrors).length > 0 ||
      Object.keys(newServiceErrors).length > 0 ||
      Object.keys(newReviewErrors).length > 0 ||
      Object.keys(newSlotErrors).length > 0
    ) {
      setErrors(newErrors);
      setServiceErrors(newServiceErrors);
      setReviewErrors(newReviewErrors);
      setSlotErrors(newSlotErrors);
      return;
    }

    setLoading(true);

    try {
      let imageUrl = image;
      if (image instanceof File) {
        imageUrl = await uploadFile(image, "Images");
      }

      const payload = {
        ...form,
        image: imageUrl,
        pricePaise: Number(form.pricePaise) || 0,
        rating: Number(form.rating) || 0,
        reviews: Number(form.reviews) || 0,
        rewardCoins: Number(form.rewardCoins) || 0,
        achievements: achievements.filter(a => a.trim() !== ""),
        certifications: certifications.filter(c => c.trim() !== ""),
        specializations: specializations.filter(s => s.trim() !== ""),
        services: services.map(s => ({ ...s, pricePaise: Number(s.pricePaise) })),
        reviewList: reviewList.map(r => ({ ...r, rating: Number(r.rating) })),
        slots: slots.map(s => ({ ...s, num: Number(s.num) })),
      };

      if (isEditMode) {
        const res = await axios.put(`/api/admin/store/addCoach?id=${editId}`, payload);
        if (res.data.success) {
          alert("Coach updated successfully");
          router.push("/admin/store-management/coach/list");
        }
      } else {
        const res = await axios.post("/api/admin/store/addCoach", payload);
        if (res.data.success) {
          alert("Coach created successfully");
          router.push("/admin/store-management/coach/list");

          handleCancel();
        }
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

  if (fetching) {
    return <div className="p-6 text-white">Loading coach data...</div>;
  }

  const getPreview = (file: File | string | null) => {
    if (!file) return "";
    if (typeof file === "string") return file;
    return URL.createObjectURL(file);
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">
          {isEditMode ? "Edit Coach Profile" : "Add Coach Profile"}
        </h1>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-8">
        
        {/* Validation Errors Box */}
        {(Object.keys(errors).length > 0 ||
          Object.keys(serviceErrors).length > 0 ||
          Object.keys(reviewErrors).length > 0 ||
          Object.keys(slotErrors).length > 0) && (
          <div className="bg-red-900/30 border border-red-500/50 rounded p-4">
            <h3 className="text-red-400 text-sm font-semibold mb-1">Please fix the following validation errors:</h3>
            <ul className="list-disc pl-5 text-xs text-red-300">
              {Object.entries(errors).map(([key, val]) => (
                <li key={key}>{val}</li>
              ))}
              {Object.entries(serviceErrors).map(([rowIndex, rowErrs]) => (
                <li key={`s-${rowIndex}`}>
                  Service #{parseInt(rowIndex, 10) + 1}: {Object.values(rowErrs).join(", ")}
                </li>
              ))}
              {Object.entries(reviewErrors).map(([rowIndex, rowErrs]) => (
                <li key={`r-${rowIndex}`}>
                  Review #{parseInt(rowIndex, 10) + 1}: {Object.values(rowErrs).join(", ")}
                </li>
              ))}
              {Object.entries(slotErrors).map(([rowIndex, rowErrs]) => (
                <li key={`sl-${rowIndex}`}>
                  Slot #{parseInt(rowIndex, 10) + 1}: {Object.values(rowErrs).join(", ")}
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
                value="coaches"
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-gray-500 cursor-not-allowed mt-1"
              />
            </div>

            <Input label="Coach ID (slug, e.g. nikhat-zareen) *" name="coachId" value={form.coachId} onChange={handleChange} placeholder="nikhat-zareen" error={errors.coachId} readOnly={isEditMode} />
            <Input label="Name *" name="name" value={form.name} onChange={handleChange} placeholder="Nikhat Zareen" error={errors.name} />
            <Input label="Title (e.g. World Boxing Champion) *" name="title" value={form.title} onChange={handleChange} placeholder="World Boxing Champion" error={errors.title} />
            
            <Input label="Role (e.g. Boxing Coach)" name="role" value={form.role} onChange={handleChange} placeholder="Boxing Coach" />
            <Input label="Tagline" name="tagline" value={form.tagline} onChange={handleChange} placeholder="Float like a butterfly..." />
            <Input label="Experience (e.g. 8+ Years)" name="experience" value={form.experience} onChange={handleChange} placeholder="8+ Years" />
            
            <Input label="Base Price (Paise)" name="pricePaise" type="number" value={form.pricePaise} onChange={handleChange} placeholder="e.g. 50000" />
            <Input label="Rating" name="rating" type="number" step="0.1" value={form.rating} onChange={handleChange} placeholder="e.g. 4.9" />
            <Input label="Reviews Count" name="reviews" type="number" value={form.reviews} onChange={handleChange} placeholder="e.g. 45" />
            <Input label="Reward Coins" name="rewardCoins" type="number" value={form.rewardCoins} onChange={handleChange} placeholder="e.g. 100" />

            <div>
              <label className="text-xs text-gray-400">Sourcing Model</label>
              <select name="sourcing_model" value={form.sourcing_model} onChange={handleChange} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1">
                <option value="independent">Independent</option>
                <option value="contracted">Contracted</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400">Governance State</label>
              <select name="governance_state" value={form.governance_state} onChange={handleChange} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1">
                <option value="approved">Approved</option>
                <option value="pending review">Pending Review</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <input
                type="checkbox"
                name="verified"
                id="verified-checkbox"
                checked={form.verified}
                onChange={handleChange}
                className="rounded bg-[#0d1117] border-gray-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="verified-checkbox" className="text-xs text-gray-400 cursor-pointer select-none">
                Verified Coach Profile
              </label>
            </div>

            <div className="col-span-1 md:col-span-2">
              <label className="text-xs text-gray-400">About / Biography</label>
              <textarea
                name="about"
                value={form.about}
                onChange={handleChange}
                placeholder="Detailed bio here..."
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white min-h-[100px] focus:outline-none focus:border-blue-500 mt-1"
              />
            </div>

            <div className="col-span-1 md:col-span-2">
              <FileInput label="Coach Profile Image *" onChange={setImage} error={errors.image} />
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

        {/* ACHIEVEMENTS, CERTIFICATIONS, SPECIALIZATIONS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-[#21262d] pt-6">
            <StringListSection title="Achievements" list={achievements} setter={setAchievements} updateFn={updateStringList} removeFn={removeStringList} addFn={addStringList} />
            <StringListSection title="Certifications" list={certifications} setter={setCertifications} updateFn={updateStringList} removeFn={removeStringList} addFn={addStringList} />
            <StringListSection title="Specializations" list={specializations} setter={setSpecializations} updateFn={updateStringList} removeFn={removeStringList} addFn={addStringList} />
        </div>

        {/* SERVICES */}
        <div className="border-t border-[#21262d] pt-6">
            <h2 className="text-md font-semibold text-white mb-4">Offered Services</h2>
            {services.map((service, i) => (
                <div key={i} className="bg-[#0d1117] p-4 rounded border border-gray-700 mb-4 relative">
                    <button onClick={() => removeService(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-500 text-lg">✕</button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 pr-8">
                        <Input label="Service Title *" value={service.title} onChange={(e) => updateService(i, "title", e.target.value)} error={serviceErrors[i]?.title} />
                        <Input label="Duration (e.g. 60 mins) *" value={service.duration} onChange={(e) => updateService(i, "duration", e.target.value)} error={serviceErrors[i]?.duration} />
                        <Input label="Price (Paise) *" type="number" value={service.pricePaise} onChange={(e) => updateService(i, "pricePaise", e.target.value)} error={serviceErrors[i]?.pricePaise} />
                        <div>
                          <label className="text-xs text-gray-400">Description</label>
                          <input placeholder="Service Details" value={service.desc} onChange={(e) => updateService(i, "desc", e.target.value)} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1" />
                        </div>
                    </div>
                </div>
            ))}
            <button onClick={addService} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700">+ Add Service</button>
        </div>

        {/* REVIEWS */}
        <div className="border-t border-[#21262d] pt-6">
            <h2 className="text-md font-semibold text-white mb-4">Seed Reviews</h2>
            {reviewList.map((review, i) => (
                <div key={i} className="bg-[#0d1117] p-4 rounded border border-gray-700 mb-4 relative">
                    <button onClick={() => removeReview(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-500 text-lg">✕</button>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2 pr-8">
                        <Input label="User Name *" value={review.user} onChange={(e) => updateReview(i, "user", e.target.value)} error={reviewErrors[i]?.user} />
                        <Input label="Rating (1-5) *" type="number" max="5" min="1" value={review.rating} onChange={(e) => updateReview(i, "rating", e.target.value)} error={reviewErrors[i]?.rating} />
                        <Input label="Comment" value={review.comment} onChange={(e) => updateReview(i, "comment", e.target.value)} />
                        <div>
                          <label className="text-xs text-gray-400">Date</label>
                          <input type="date" value={review.date} onChange={(e) => updateReview(i, "date", e.target.value)} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1" />
                        </div>
                    </div>
                </div>
            ))}
            <button onClick={addReview} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700">+ Add Review</button>
        </div>

        {/* SLOTS */}
        <div className="border-t border-[#21262d] pt-6">
            <h2 className="text-md font-semibold text-white mb-4">Availability Slots</h2>
            {slots.map((slot, i) => (
                <div key={i} className="bg-[#0d1117] p-4 rounded border border-gray-700 mb-4 relative">
                    <button onClick={() => removeSlot(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-500 text-lg">✕</button>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-2 pr-8">
                        <div>
                          <label className="text-xs text-gray-400">Date *</label>
                          <input type="date" value={slot.date} onChange={(e) => updateSlot(i, "date", e.target.value)} className={`w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white mt-1 ${slotErrors[i]?.date ? 'border-red-500' : 'border-gray-700'}`} title="Date" />
                          {slotErrors[i]?.date && <span className="text-red-500 text-xs mt-1 block">{slotErrors[i]?.date}</span>}
                        </div>
                        <Input label="Day (auto)" value={slot.day} readOnly />
                        <div>
                          <label className="text-xs text-gray-400">Time *</label>
                          <input type="time" value={slot.time} onChange={(e) => updateSlot(i, "time", e.target.value)} className={`w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white mt-1 ${slotErrors[i]?.time ? 'border-red-500' : 'border-gray-700'}`} title="Time" />
                          {slotErrors[i]?.time && <span className="text-red-500 text-xs mt-1 block">{slotErrors[i]?.time}</span>}
                        </div>
                        <Input label="Capacity *" type="number" placeholder="Capacity (num)" value={slot.num} onChange={(e) => updateSlot(i, "num", e.target.value)} error={slotErrors[i]?.num} />
                        <div>
                          <label className="text-xs text-gray-400">Status</label>
                          <select value={slot.status} onChange={(e) => updateSlot(i, "status", e.target.value)} className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1">
                              <option value="available">Available</option>
                              <option value="booked">Booked</option>
                              <option value="locked">Locked</option>
                          </select>
                        </div>
                    </div>
                </div>
            ))}
            <button onClick={addSlot} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700">+ Add Slot</button>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3 pt-4 border-t border-[#21262d]">
          <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded font-semibold text-white disabled:opacity-50">
            {loading ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update Coach" : "Create Coach")}
          </button>
          <button onClick={handleCancel} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* REUSABLE INPUTS */
type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; };
function Input({ label, error, ...props }: InputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input {...props} className={`w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white focus:outline-none mt-1 ${
          error ? "border-red-500" : "border-gray-700 focus:border-blue-500"
        }`} />
      {error && <span className="text-red-500 text-xs mt-1 block">{error}</span>}
    </div>
  );
}

type FileInputProps = { label: string; error?: string; onChange: (file: File | null) => void; };
function FileInput({ label, error, onChange }: FileInputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input type="file" onChange={(e) => onChange(e.target.files?.[0] ?? null)} className={`w-full text-sm text-white border rounded cursor-pointer bg-[#0d1117] px-3 py-2 mt-1 ${
          error ? "border-red-500" : "border-gray-700"
        }`} />
      {error && <span className="text-red-500 text-xs mt-1 block">{error}</span>}
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
