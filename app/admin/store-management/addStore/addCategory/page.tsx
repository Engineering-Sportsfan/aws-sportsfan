"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes } from "react";

type FormState = {
    bgOpacity: string;
    color: string;
    icon: string;
    key: string;
    label: string;
    route: string;
    sport: string;
    status: string;
};

export default function AddCategoryForm() {
    const [form, setForm] = useState<FormState>({
        bgOpacity: "0.12",
        color: "#0ea5e9",
        icon: "Zap",
        key: "athletes",
        label: "Athletes",
        route: "/MainModules/AtheleteStore/StoreAthelete",
        sport: "athlete",
        status: "active",
    });

    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleCancel = () => {
        setForm({
            bgOpacity: "0.12",
            color: "#0ea5e9",
            icon: "Zap",
            key: "athletes",
            label: "Athletes",
            route: "/MainModules/AtheleteStore/StoreAthelete",
            sport: "athlete",
            status: "active",
        });
    };

    const handleSubmit = async () => {
        if (!form.key || !form.label || !form.sport || !form.status) {
            alert("Required fields missing");
            return;
        }

        setLoading(true);

        try {
            const payload = {
                ...form,
                bgOpacity: Number(form.bgOpacity),
            };

            const res = await axios.post("/api/admin/store/addCategory", payload);

            if (res.data.success) {
                alert("Category created successfully");
                handleCancel();
                // Optionally redirect to a list page
                // router.push("/admin/store-management/category-list");
            }
        } catch (error: unknown) {
            console.error("Error:", error);
            const serverMessage = axios.isAxiosError(error)
                ? (error.response?.data?.error || error.response?.data?.message || error.message)
                : error instanceof Error
                    ? error.message
                    : "Error saving category";
            alert(serverMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-lg font-semibold text-white">
                    Add Store Category
                </h1>
            </div>

            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
                {/* Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Key" name="key" value={form.key} onChange={handleChange} />
                    <Input label="Label" name="label" value={form.label} onChange={handleChange} />
                    <Input label="Icon" name="icon" value={form.icon} onChange={handleChange} />
                    <Input label="Color (HEX)" name="color" value={form.color} onChange={handleChange} />
                    <Input label="Route" name="route" value={form.route} onChange={handleChange} />
                    <Input type="number" step="0.01" label="Background Opacity" name="bgOpacity" value={form.bgOpacity} onChange={handleChange} />
                    
                    <div>
                        <label className="text-xs text-gray-400">Sport</label>
                        <select
                            name="sport"
                            value={form.sport}
                            onChange={handleChange}
                            className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                        >
                            <option value="athlete">Athlete</option>
                            <option value="cricket">Cricket</option>
                            <option value="football">Football</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-gray-400">Status</label>
                        <select
                            name="status"
                            value={form.status}
                            onChange={handleChange}
                            className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                        >
                            <option value="active">Active</option>
                            <option value="pending review">Pending Review</option>
                        </select>
                    </div>
                </div>

                {/* ACTIONS */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 bg-blue-600 py-3 rounded font-semibold text-white"
                    >
                        {loading ? "Creating..." : "Create Category"}
                    </button>

                    <button
                        onClick={handleCancel}
                        className="flex-1 bg-gray-700 py-3 rounded font-semibold text-white"
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
};

function Input({ label, ...props }: InputProps) {
    return (
        <div>
            <label className="text-xs text-gray-400">{label}</label>
            <input
                {...props}
                className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
            />
        </div>
    );
}
