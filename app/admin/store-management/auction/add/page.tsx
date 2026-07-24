"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/*  TYPES  */

export interface AuctionProduct {
    // --- CATEGORY 1: Admin-filled Fields (Form Inputs) ---
    category: "Auctions";
    title: string;
    description: string;
    image: string;
    governance_state: "approved" | "pending review" | "rejected";
    pricePaise: number; // calculated from price in rupees
    reservePrice: number; // in paise
    minIncrementPaise: number; // calculated from minIncrement in rupees
    endsAt: any; // Firestore Timestamp computed server-side
    paymentDeadline: any; // Firestore Timestamp computed server-side
    status: "active";
    createdAt?: any;
    updatedAt?: any;

    // --- CATEGORY 2: System-managed Fields (Managed by Bidding Engine) ---
    biddersCount: number;
    currentBidPaise: number | null;
    highestBidderId: string | null;
    winnerId: string | null;
    winnerPaymentStatus: string | null;
}

type FormState = {
    title: string;
    description: string;
    governance_state: "approved" | "pending review" | "rejected" | "";
    price: string; // starting price in rupees
    reservePrice: string; // reserve price in paise
    minIncrement: string; // min increment in rupees
    durationValue: string;
    durationUnit: "hours" | "days";
};

/*  COMPONENT  */

export default function CreateAuction() {
    const [form, setForm] = useState<FormState>({
        title: "",
        description: "",
        governance_state: "pending review",
        price: "",
        reservePrice: "",
        minIncrement: "",
        durationValue: "",
        durationUnit: "days",
    });

    const [image, setImage] = useState<File | null>(null);
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
        setForm((prev) => {
            const next = { ...prev, [name]: value };
            if (name === "price") {
                const rupeeVal = parseFloat(value);
                next.reservePrice = isNaN(rupeeVal) ? "" : String(Math.round(rupeeVal * 100));
            }
            return next;
        });
        if (errors[name]) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[name];
                return next;
            });
        }
    };

    /*  RESET  */
    const handleCancel = () => {
        setForm({
            title: "",
            description: "",
            governance_state: "pending review",
            price: "",
            reservePrice: "",
            minIncrement: "",
            durationValue: "",
            durationUnit: "days",
        });
        setImage(null);
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
        if (!form.price) newErrors.price = "Starting Price is required";
        if (!form.reservePrice) newErrors.reservePrice = "Reserve Price is required";
        if (!form.minIncrement) newErrors.minIncrement = "Minimum Increment is required";
        if (!form.durationValue) newErrors.durationValue = "Duration is required";
        if (!image) newErrors.image = "Main Image is required";

        if (form.price && form.reservePrice) {
            const pricePaise = Number(form.price) * 100;
            const reservePriceInt = Number(form.reservePrice);
            if (reservePriceInt < pricePaise) {
                newErrors.reservePrice = "Reserve price (in paise) cannot be less than starting price (converted to paise)";
            }
        }

        if (form.minIncrement) {
            const minIncrementPaise = Number(form.minIncrement) * 100;
            if (minIncrementPaise <= 0) {
                newErrors.minIncrement = "Minimum increment must be greater than 0";
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
            };

            const res = await axios.post("/api/admin/store/addAuction", payload);

            if (res.data.success) {
                alert("Auction created successfully");
                handleCancel();
            }
        } catch (error: unknown) {
            console.error("Error:", error);
            const serverMessage = axios.isAxiosError(error)
                ? (error.response?.data?.error || error.response?.data?.message || error.message)
                : error instanceof Error
                    ? error.message
                    : "Error saving auction";
            alert(serverMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-lg font-semibold text-white">
                    Create Auction Listing
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

                {/* Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Title *" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Signed Match Jersey" error={errors.title} />
                    
                    <Select label="Governance State" name="governance_state" value={form.governance_state} onChange={handleChange}>
                        <option value="pending review">Pending Review</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </Select>

                    <Input label="Starting Price (Rupees) *" type="number" name="price" value={form.price} onChange={handleChange} placeholder="e.g. 5000" error={errors.price} />
                    <Input label="Reserve Price (Paise) *" type="number" name="reservePrice" value={form.reservePrice} onChange={handleChange} placeholder="e.g. 500000" error={errors.reservePrice} />
                    
                    <Input label="Min Increment (Rupees) *" type="number" name="minIncrement" value={form.minIncrement} onChange={handleChange} placeholder="e.g. 500" error={errors.minIncrement} />
                    
                    <div className="grid grid-cols-2 gap-2">
                        <Input label="Duration Value *" type="number" name="durationValue" value={form.durationValue} onChange={handleChange} placeholder="e.g. 3" error={errors.durationValue} />
                        <Select label="Duration Unit" name="durationUnit" value={form.durationUnit} onChange={handleChange}>
                            <option value="days">Days</option>
                            <option value="hours">Hours</option>
                        </Select>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                        <FileInput label="Auction Image *" onChange={setImage} error={errors.image} />
                        {image && (
                            <img
                                src={getPreview(image)}
                                alt="preview"
                                className="w-24 h-24 object-cover mt-2 rounded border border-gray-700"
                            />
                        )}
                    </div>

                    <div className="col-span-1 md:col-span-2">
                        <Textarea label="Description *" name="description" value={form.description} onChange={handleChange} placeholder="e.g. Official match jersey worn during the final..." error={errors.description} />
                    </div>
                </div>

                {/* ACTIONS */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 bg-blue-600 py-3 rounded font-semibold text-white disabled:opacity-50"
                    >
                        {loading ? "Creating..." : "Create Auction"}
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
