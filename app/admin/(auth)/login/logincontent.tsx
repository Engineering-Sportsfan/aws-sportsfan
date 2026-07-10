
//app/admin/page.tsx

"use client";

import axios from "axios";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

//  Create axios instance with relative URL (will use rewrites)
const api = axios.create({
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

export default function LoginCard() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [showChangePassword, setShowChangePassword] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [tempPassword, setTempPassword] = useState("");

    const router = useRouter();
    const searchParams = useSearchParams();
    const authError = searchParams.get("error");

    const getAuthError = (error: string | null) => {
        if (error === "AccessDenied") return "Your account has been disabled. Please contact support.";
        if (error === "OAuthSignin") return "Failed to sign in with Google. Please try again.";
        if (error === "OAuthCallback") return "Google sign in was cancelled or failed.";
        if (error === "OAuthAccountNotLinked") return "This email is already registered. Please login with email & password.";
        return null;
    };

    // Handle initial login - uses rewrites to proxy to Admin Panel
    const handleLogin = async () => {
        if (!email || !password) {
            setError("Please enter email & password");
            return;
        }

        try {
            setLoading(true);
            setError("");

            //  Use relative URL - will be proxied via rewrites
            const response = await api.post("/api/auth/login", {
                email,
                password,
            });

            if (response.data.success) {
                if (response.data.requiresPasswordChange) {
                    setTempPassword(password);
                    setShowChangePassword(true);
                } else {
                    if (response.data.user?.role === "host") {
                        router.push("/MainModules/HostDashboard");
                    } else {
                        router.push("/MainModules/HomePage");
                    }
                }
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const status = err.response?.status;
                const errorMessage = err.response?.data?.error;

                if (status === 401) {
                    setError("Invalid email or password. Please try again.");
                } else if (status === 403) {
                    setError(errorMessage ?? "Access denied.");
                } else if (status === 404) {
                    setError("No account found with this email. Please sign up first.");
                } else if (status === 400) {
                    setError("Please fill in all required fields.");
                } else if (status === 429) {
                    setError("Too many login attempts. Please wait a moment before trying again.");
                } else if (status === 500) {
                    setError("Server error. Please try again later.");
                } else if (errorMessage) {
                    setError(errorMessage);
                } else {
                    setError("Login failed. Please check your connection and try again.");
                }
            } else if (err instanceof Error) {
                setError("Unable to connect to the server. Please check your internet connection.");
            } else {
                setError("Login failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle password change - uses rewrites
    const handleChangePassword = async () => {
        if (!newPassword || !confirmPassword) {
            setError("Please enter new password");
            return;
        }

        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        try {
            setLoading(true);
            setError("");

            //  Use relative URL - will be proxied via rewrites
            await api.post("/api/auth/host/changepassword", {
                email,
                currentPassword: tempPassword,
                newPassword: newPassword,
            });

            const loginResponse = await api.post("/api/auth/login", {
                email,
                password: newPassword,
            });

            if (loginResponse.data.success) {
                router.push("/MainModules/HostDashboard");
            } else {
                setError("Password changed. Please login again.");
                setShowChangePassword(false);
                setPassword("");
                setNewPassword("");
                setConfirmPassword("");
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.error || "Failed to change password");
            } else {
                setError("An error occurred");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBackToLogin = () => {
        setShowChangePassword(false);
        setNewPassword("");
        setConfirmPassword("");
        setTempPassword("");
        setError("");
    };

    // Render Change Password Form
    if (showChangePassword) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center gap-6 relative bg-gradient-to-b from-[#3a0000] via-black to-[#120000]">
                <div className="absolute inset-0 bg-gradient-to-br from-red-900/30 via-transparent to-orange-600/20 pointer-events-none" />
                <div className="flex flex-col items-center z-10">
                    <img src="/images/logo.png" alt="logo" className="w-[10px] h-[10px] lg:w-[56px] lg:h-[66.66px] mb-2" />
                    <h1 className="text-white text-2xl font-semibold text-center">Change Password</h1>
                    <p className="text-gray-400 text-sm text-center mt-2">
                        First time login. Please set a new password for<br />
                        <span className="text-orange-400">{email}</span>
                    </p>
                </div>
                <div className="relative z-10 w-[300px] md:w-full max-w-sm px-5 py-8 rounded-3xl bg-[#222222] backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
                    <div className="rounded-2xl p-3 space-y-3 mb-6">
                        <input
                            type="password"
                            placeholder="New Password (min 6 characters)"
                            className="w-full bg-black/40 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder:text-gray-500"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                        />
                        <input
                            type="password"
                            placeholder="Confirm New Password"
                            className="w-full bg-black/40 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder:text-gray-500"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                        />
                    </div>
                    {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
                    <button
                        onClick={handleChangePassword}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white py-3 rounded-full font-medium mb-3 hover:opacity-90 transition disabled:opacity-50"
                    >
                        {loading ? "Changing..." : "Change Password & Login"}
                    </button>
                    <button
                        onClick={handleBackToLogin}
                        className="w-full bg-gray-700 text-white py-3 rounded-full font-medium hover:bg-gray-600 transition"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    // Render Normal Login Form
    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center gap-6 relative bg-gradient-to-b from-[#3a0000] via-black to-[#120000]">
            <div className="absolute inset-0 bg-gradient-to-br from-red-900/30 via-transparent to-orange-600/20 pointer-events-none" />
            <div className="flex flex-col items-center z-10">
                <img src="/images/logo.png" alt="logo" className="w-[10px] h-[10px] lg:w-[56px] lg:h-[66.66px] mb-2" />
                <h1 className="text-white text-2xl font-semibold text-center">Welcome back!</h1>
            </div>
            <div className="relative z-10 w-[300px] md:w-full max-w-sm px-5 py-8 rounded-3xl bg-[#222222] backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
                <div className="rounded-2xl p-3 space-y-3 mb-6">
                    <input
                        type="email"
                        placeholder="Email Address"
                        className="w-full bg-black/40 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder:text-gray-500"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            className="w-full bg-black/40 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder:text-gray-500 pr-10"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                        >
                            👁
                        </button>
                    </div>
                    <Link href="/auth/forgot-password">
                        <div className="flex justify-end">
                            <p className="text-gray-400 text-sm text-right hover:underline cursor-pointer">Forgot Password?</p>
                        </div>
                    </Link>
                </div>
                {getAuthError(authError) && <p className="text-red-400 text-sm text-center mb-4">{getAuthError(authError)}</p>}
                {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full bg-gray-300 text-black py-3 rounded-full font-medium mb-6 hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "Logging in..." : "Continue"}
                </button>
                <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1 h-[1px] bg-gray-700" />
                    <span className="text-gray-500 text-xs tracking-widest">OR</span>
                    <div className="flex-1 h-[1px] bg-gray-700" />
                </div>
                <button
                    // onClick={() => signIn("google", {
                    //     callbackUrl: process.env.NEXT_PUBLIC_APP_URL + "/MainModules/HomePage"
                    // })}
                    onClick={() => {
                        const redirect = searchParams.get("redirect") || "/admin/dashboard";
                        signIn("google", { callbackUrl: redirect });
                    }}
                    className="w-full bg-white text-black py-3 rounded-full font-medium flex items-center justify-center gap-2 mb-6 hover:bg-gray-100 transition"
                >
                    <svg width="18" height="18" viewBox="0 0 18 18">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                        <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" />
                    </svg>
                    Continue with Google
                </button>
                <p className="text-gray-300 text-sm text-center">
                    Don&apos;t have an account?{" "}
                    <Link href="/auth/register">
                        <span className="font-semibold text-white cursor-pointer">Sign Up</span>
                    </Link>
                </p>
            </div>
        </div>
    );
}