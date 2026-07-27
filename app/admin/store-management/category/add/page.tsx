"use client";

import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, ChangeEvent, InputHTMLAttributes, useEffect } from "react";

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
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("id");
    const isEditMode = !!editId;

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

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);

    useEffect(() => {
        if (editId) {
            setFetching(true);
            axios.get(`/api/admin/store/addCategory?id=${editId}`)
                .then(res => {
                    if (res.data.success && res.data.data) {
                        const data = res.data.data;
                        setForm({
                            bgOpacity: data.bgOpacity !== undefined ? String(data.bgOpacity) : "0.12",
                            color: data.color || "",
                            icon: data.icon || "",
                            key: data.key || "",
                            label: data.label || "",
                            route: data.route || "",
                            sport: data.sport || "athlete",
                            status: data.status || "active",
                        });
                    }
                })
                .catch(err => {
                    console.error("Failed to fetch category data:", err);
                    alert("Failed to load category data for editing.");
                })
                .finally(() => {
                    setFetching(false);
                });
        }
    }, [editId]);

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

    const handleCancel = () => {
        if (isEditMode) {
            router.push("/admin/store-management/category/list");
        } else {
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
            setErrors({});
        }
    };

    const handleSubmit = async () => {
        const newErrors: Record<string, string> = {};
        if (!form.key) newErrors.key = "Key is required";
        if (!form.label) newErrors.label = "Label is required";
        if (!form.sport) newErrors.sport = "Sport is required";
        if (!form.status) newErrors.status = "Status is required";

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);

        try {
            const payload = {
                ...form,
                bgOpacity: Number(form.bgOpacity),
            };

            if (isEditMode) {
                const res = await axios.put(`/api/admin/store/addCategory?id=${editId}`, payload);
                if (res.data.success) {
                    alert("Category updated successfully");
                    router.push("/admin/store-management/category/list");
                }
            } else {
                const res = await axios.post("/api/admin/store/addCategory", payload);
                if (res.data.success) {
                    alert("Category created successfully");
                    router.push("/admin/store-management/category/list");

                    handleCancel();
                }
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

    if (fetching) {
        return <div className="p-6 text-white">Loading category data...</div>;
    }

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-lg font-semibold text-white">
                    {isEditMode ? "Edit Store Category" : "Add Store Category"}
                </h1>
            </div>

            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
                
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
                    <Input label="Key *" name="key" value={form.key} onChange={handleChange} error={errors.key} />
                    <Input label="Label *" name="label" value={form.label} onChange={handleChange} error={errors.label} />
                    <Input label="Icon" name="icon" value={form.icon} onChange={handleChange} error={errors.icon} />
                    <Input label="Color (HEX)" name="color" value={form.color} onChange={handleChange} error={errors.color} />
                    <Input label="Route" name="route" value={form.route} onChange={handleChange} error={errors.route} />
                    <Input type="number" step="0.01" label="Background Opacity" name="bgOpacity" value={form.bgOpacity} onChange={handleChange} error={errors.bgOpacity} />
                    
                    <div>
                      <Select label="Sport *" name="sport" value={form.sport} onChange={handleChange} error={errors.sport}>
                        <option value="athlete">Athlete</option>
                        <option value="cricket">Cricket</option>
                        <option value="football">Football</option>
                      </Select>
                    </div>

                    <div>
                      <Select label="Status *" name="status" value={form.status} onChange={handleChange} error={errors.status}>
                        <option value="active">Active</option>
                        <option value="pending review">Pending Review</option>
                      </Select>
                    </div>
                </div>

                {/* ACTIONS */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 bg-blue-600 py-3 rounded font-semibold text-white transition-colors"
                    >
                        {loading ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update Category" : "Create Category")}
                    </button>

                    <button
                        onClick={handleCancel}
                        className="flex-1 bg-gray-700 py-3 rounded font-semibold text-white transition-colors"
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
