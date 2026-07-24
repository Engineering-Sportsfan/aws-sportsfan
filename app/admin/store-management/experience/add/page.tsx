"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/*  TYPES  */

type AgendaItem = {
    time: string;
    item: string;
};

type FormState = {
    title: string;
    description: string;
    type: "online" | "in-person" | "hybrid" | "";
    tag: string;
    tagColor: string;
    governanceState: "approved" | "pending review" | "rejected" | "";
    status: "active" | "inactive" | "draft" | "";
    athlete: string;
    host: string;
    hostRole: string;
    eventStartsAt: string; // ISO datetime
    duration: string;
    onlineLink: string;
    price: string;
    rewardCoins: string;
    totalSeats: string;
    seatsBooked: string;
};

/*  COMPONENT  */

export default function CreateExperience() {
    const [form, setForm] = useState<FormState>({
        title: "",
        description: "",
        type: "",
        tag: "",
        tagColor: "#00c864",
        governanceState: "pending review",
        status: "draft",
        athlete: "",
        host: "",
        hostRole: "",
        eventStartsAt: "",
        duration: "",
        onlineLink: "",
        price: "",
        rewardCoins: "0",
        totalSeats: "",
        seatsBooked: "0",
    });

    const [image, setImage] = useState<File | null>(null);
    const [athleteImg, setAthleteImg] = useState<File | null>(null);

    const [agenda, setAgenda] = useState<AgendaItem[]>([]);
    const [inclusions, setInclusions] = useState<string[]>([]);
    const [rules, setRules] = useState<string[]>([]);

    const [errors, setErrors] = useState<Record<string, string>>({});
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

    const handleDatetimeChange = (e: ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val) {
            setForm((prev) => ({ ...prev, eventStartsAt: `${val}:00+05:30` }));
        } else {
            setForm((prev) => ({ ...prev, eventStartsAt: "" }));
        }
        if (errors.eventStartsAt) {
            setErrors(prev => {
                const next = { ...prev };
                delete next.eventStartsAt;
                return next;
            });
        }
    };

    /*  DYNAMIC LISTS  */
    const addAgenda = () => setAgenda((prev) => [...prev, { time: "", item: "" }]);
    const updateAgenda = (i: number, field: keyof AgendaItem, value: string) => {
        const updated = [...agenda];
        updated[i][field] = value;
        setAgenda(updated);
    };
    const removeAgenda = (i: number) => setAgenda((prev) => prev.filter((_, idx) => idx !== i));

    const addInclusion = () => setInclusions((prev) => [...prev, ""]);
    const updateInclusion = (i: number, value: string) => {
        const updated = [...inclusions];
        updated[i] = value;
        setInclusions(updated);
    };
    const removeInclusion = (i: number) => setInclusions((prev) => prev.filter((_, idx) => idx !== i));

    const addRule = () => setRules((prev) => [...prev, ""]);
    const updateRule = (i: number, value: string) => {
        const updated = [...rules];
        updated[i] = value;
        setRules(updated);
    };
    const removeRule = (i: number) => setRules((prev) => prev.filter((_, idx) => idx !== i));

    /*  RESET  */
    const handleCancel = () => {
        setForm({
            title: "",
            description: "",
            type: "",
            tag: "",
            tagColor: "#00c864",
            governanceState: "pending review",
            status: "draft",
            athlete: "",
            host: "",
            hostRole: "",
            eventStartsAt: "",
            duration: "",
            onlineLink: "",
            price: "",
            rewardCoins: "0",
            totalSeats: "",
            seatsBooked: "0",
        });
        setImage(null);
        setAthleteImg(null);
        setAgenda([]);
        setInclusions([]);
        setRules([]);
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
        if (!form.description) newErrors.description = "Description is required";
        if (!form.type) newErrors.type = "Type is required";
        if (!form.athlete) newErrors.athlete = "Athlete is required";
        if (!form.host) newErrors.host = "Host is required";
        if (!form.eventStartsAt) newErrors.eventStartsAt = "Event Start Date & Time is required";
        if (!form.duration) newErrors.duration = "Duration is required";
        if (!form.price) newErrors.price = "Price is required";
        if (!form.totalSeats) newErrors.totalSeats = "Total Seats is required";

        if ((form.type === "online" || form.type === "hybrid") && !form.onlineLink) {
            newErrors.onlineLink = "Online link is required for online/hybrid experiences";
        }

        if (form.seatsBooked && form.totalSeats) {
            if (Number(form.seatsBooked) > Number(form.totalSeats)) {
                newErrors.seatsBooked = "Seats booked cannot be greater than total seats";
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);

        try {
            let imageUrl = "";
            let athleteImgUrl = "";

            if (image) imageUrl = await uploadFile(image, "Images");
            if (athleteImg) athleteImgUrl = await uploadFile(athleteImg, "Images");

            const payload = {
                ...form,
                image: imageUrl,
                athleteImg: athleteImgUrl,
                agenda,
                inclusions,
                rules,
            };

            const res = await axios.post("/api/admin/store/addExperience", payload);

            if (res.data.success) {
                alert("Experience created successfully");
                handleCancel();
            }
        } catch (error: unknown) {
            console.error("Error:", error);
            const serverMessage = axios.isAxiosError(error)
                ? (error.response?.data?.error || error.response?.data?.message || error.message)
                : error instanceof Error
                    ? error.message
                    : "Error saving experience";
            alert(serverMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-lg font-semibold text-white">
                    Create Experience Product
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
                    <Input label="Athlete *" name="athlete" value={form.athlete} onChange={handleChange} placeholder="e.g. MS Dhoni" error={errors.athlete} />
                    <Input label="Host Name *" name="host" value={form.host} onChange={handleChange} error={errors.host} />
                    <Input label="Host Role" name="hostRole" value={form.hostRole} onChange={handleChange} placeholder="e.g. Sports Biomechanist" />
                    
                    <Select label="Type *" name="type" value={form.type} onChange={handleChange} error={errors.type}>
                        <option value="">-- Select Type --</option>
                        <option value="online">Online</option>
                        <option value="in-person">In-Person</option>
                        <option value="hybrid">Hybrid</option>
                    </Select>

                    <Input label="Online Meeting Link (Required if type online/hybrid) *" name="onlineLink" value={form.onlineLink} onChange={handleChange} error={errors.onlineLink} />

                    <div>
                        <label className="text-xs text-gray-400">Event Start Date & Time (IST) *</label>
                        <input
                            type="datetime-local"
                            onChange={handleDatetimeChange}
                            className={`w-full bg-[#0d1117] border px-3 py-2 rounded text-sm text-white focus:outline-none mt-1 ${
                                errors.eventStartsAt ? "border-red-500" : "border-gray-700 focus:border-blue-500"
                            }`}
                        />
                        {errors.eventStartsAt && <span className="text-red-500 text-xs mt-1 block">{errors.eventStartsAt}</span>}
                    </div>

                    <Input label="Duration (e.g. 90 mins) *" name="duration" value={form.duration} onChange={handleChange} error={errors.duration} />
                    <Input label="Price (INR) *" type="number" name="price" value={form.price} onChange={handleChange} error={errors.price} />
                    <Input label="Reward Coins" type="number" name="rewardCoins" value={form.rewardCoins} onChange={handleChange} />
                    <Input label="Total Seats *" type="number" name="totalSeats" value={form.totalSeats} onChange={handleChange} error={errors.totalSeats} />
                    <Input label="Seats Booked" type="number" name="seatsBooked" value={form.seatsBooked} onChange={handleChange} error={errors.seatsBooked} />

                    <Input label="Tag Label" name="tag" value={form.tag} onChange={handleChange} placeholder="e.g. Limited Seats" />
                    
                    <div>
                        <label className="text-xs text-gray-400">Tag Accent Color</label>
                        <input
                            type="color"
                            name="tagColor"
                            value={form.tagColor}
                            onChange={handleChange}
                            className="w-full bg-[#0d1117] border border-gray-700 px-1 py-1 rounded cursor-pointer mt-1 h-[38px]"
                        />
                    </div>

                    <Select label="Governance State" name="governanceState" value={form.governanceState} onChange={handleChange}>
                        <option value="pending review">Pending Review</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </Select>

                    <Select label="Status" name="status" value={form.status} onChange={handleChange}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </Select>

                    <div className="col-span-1 md:col-span-2">
                        <FileInput label="Main Experience Banner Image" onChange={setImage} />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                        <FileInput label="Athlete/Host Profile Image" onChange={setAthleteImg} />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                        <Textarea label="Description *" name="description" value={form.description} onChange={handleChange} error={errors.description} />
                    </div>
                </div>

                {/* AGENDA */}
                <div className="border-t border-[#21262d] pt-6">
                    <h2 className="text-sm font-semibold text-white mb-2">Agenda Timetable</h2>
                    {agenda.map((item, i) => (
                        <div key={i} className="flex gap-2 mb-2 items-center bg-[#0d1117] p-2 rounded border border-gray-800">
                            <input
                                placeholder="Time (e.g. 10:00 AM)"
                                value={item.time}
                                onChange={(e) => updateAgenda(i, "time", e.target.value)}
                                className="w-1/4 bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                            />
                            <input
                                placeholder="Session Details"
                                value={item.item}
                                onChange={(e) => updateAgenda(i, "item", e.target.value)}
                                className="flex-1 bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                            />
                            <button onClick={() => removeAgenda(i)} className="text-red-400 hover:text-red-500">✕</button>
                        </div>
                    ))}
                    <button onClick={addAgenda} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700 mt-2">+ Add Session</button>
                </div>

                {/* INCLUSIONS */}
                <div className="border-t border-[#21262d] pt-6">
                    <h2 className="text-sm font-semibold text-white mb-2">What is Included (Inclusions)</h2>
                    {inclusions.map((inc, i) => (
                        <div key={i} className="flex gap-2 mb-2 items-center">
                            <input
                                value={inc}
                                onChange={(e) => updateInclusion(i, e.target.value)}
                                className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                                placeholder={`Inclusion ${i + 1}`}
                            />
                            <button onClick={() => removeInclusion(i)} className="text-red-400 hover:text-red-500">✕</button>
                        </div>
                    ))}
                    <button onClick={addInclusion} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700 mt-2">+ Add Inclusion</button>
                </div>

                {/* RULES */}
                <div className="border-t border-[#21262d] pt-6">
                    <h2 className="text-sm font-semibold text-white mb-2">Guidelines / Rules</h2>
                    {rules.map((rule, i) => (
                        <div key={i} className="flex gap-2 mb-2 items-center">
                            <input
                                value={rule}
                                onChange={(e) => updateRule(i, e.target.value)}
                                className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                                placeholder={`Rule ${i + 1}`}
                            />
                            <button onClick={() => removeRule(i)} className="text-red-400 hover:text-red-500">✕</button>
                        </div>
                    ))}
                    <button onClick={addRule} className="text-blue-400 text-sm bg-[#0d1117] px-3 py-2 rounded border border-gray-700 mt-2">+ Add Guideline</button>
                </div>

                {/* ACTIONS */}
                <div className="flex gap-3 pt-6 border-t border-[#21262d]">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 bg-blue-600 py-3 rounded font-semibold text-white disabled:opacity-50"
                    >
                        {loading ? "Creating..." : "Create Experience"}
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
    onChange: (file: File | null) => void;
};

function FileInput({ label, onChange }: FileInputProps) {
    return (
        <div>
            <label className="text-xs text-gray-400">{label}</label>
            <input
                type="file"
                onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-white border border-gray-700 rounded cursor-pointer bg-[#0d1117] px-3 py-2 mt-1"
            />
        </div>
    );
}
