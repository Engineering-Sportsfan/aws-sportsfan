'use client';

import Link from "next/link";
import { useState } from "react";
import { Manrope, Oswald } from "next/font/google";

const titleFont = Oswald({
    subsets: ["latin"],
    weight: ["500", "600"],
});

const bodyFont = Manrope({
    subsets: ["latin"],
    weight: ["400", "500", "700"],
});

type CreatePasswordProps = {
    phone?: string;
    onPasswordCreate?: (password: string) => void;
    onBack?: () => void;
    loading?: boolean;
};

export default function CreatePassword({ phone = "9876543", onPasswordCreate, onBack, loading = false }: CreatePasswordProps) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordError, setPasswordError] = useState("");

    const handleCreatePassword = () => {
        if (password.length < 6) {
            setPasswordError("Password must be at least 6 characters");
            return;
        }
        if (password !== confirmPassword) {
            setPasswordError("Passwords do not match");
            return;
        }
        
        setPasswordError("");
        
        if (onPasswordCreate) {
            onPasswordCreate(password);
        }
    };

    const handleBack = () => {
        if (onBack) {
            onBack();
        }
    };

    const isPasswordValid = password.length >= 6 && password === confirmPassword;

    return (
        <main className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-black px-6 py-12 text-white`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(255,48,111,0.25),transparent_38%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_80%,rgba(255,140,65,0.12),transparent_42%)]" />

            <section className="relative z-10 mx-auto flex min-h-screen flex-col items-center justify-center">
                <div className="w-full max-w-[640px]">
                    <div className="mb-12 flex flex-col items-center gap-4">
                        <svg width="100" height="100" viewBox="0 0 92 92" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 45.7356C0 20.4765 20.4765 0 45.7356 0C70.9946 0 91.4712 20.4765 91.4712 45.7356C91.4712 70.9946 70.9946 91.4712 45.7356 91.4712C20.4765 91.4712 0 70.9946 0 45.7356Z" fill="url(#paint0_linear)" />
                            <path d="M52.0864 35.1485C53.2095 35.1485 54.2867 35.5946 55.0808 36.3888C55.875 37.183 56.3212 38.2601 56.3212 39.3832M64.7907 39.3832C64.7913 41.3676 64.327 43.3245 63.4351 45.0971C62.5432 46.8697 61.2485 48.4088 59.6547 49.5909C58.0609 50.773 56.2123 51.5654 54.2571 51.9044C52.302 52.2435 50.2946 52.1199 48.3958 51.5434L43.6168 56.3223H39.3821V60.5571H35.1473V64.7919H28.7951C28.2336 64.7919 27.695 64.5688 27.2979 64.1717C26.9008 63.7746 26.6777 63.2361 26.6777 62.6745V57.1989C26.6779 56.6374 26.901 56.0989 27.2981 55.702L39.9262 43.0738C39.3978 41.327 39.252 39.4869 39.4986 37.6786C39.7452 35.8704 40.3786 34.1365 41.3554 32.595C42.3323 31.0535 43.6299 29.7405 45.1598 28.7455C46.6896 27.7505 48.4159 27.0968 50.2211 26.8288C52.0263 26.5609 53.8681 26.685 55.621 27.1928C57.374 27.7005 58.9969 28.58 60.3794 29.7713C61.762 30.9626 62.8716 32.4378 63.6328 34.0964C64.394 35.7551 64.789 37.5583 64.7907 39.3832Z" stroke="white" strokeWidth="5.29348" strokeLinecap="round" strokeLinejoin="round" />
                            <defs>
                                <linearGradient id="paint0_linear" x1="7.45507e-08" y1="31.4432" x2="91.4712" y2="60.0279" gradientUnits="userSpaceOnUse">
                                    <stop offset="0.016129" stopColor="#CA0049" />
                                    <stop offset="0.92258" stopColor="#FF6A3D" />
                                </linearGradient>
                            </defs>
                        </svg>

                        <div className="text-center">
                            <h1 className={`${titleFont.className} text-3xl font-bold uppercase leading-tight tracking-wide`}>
                                Set Temporary Password
                            </h1>

                            <p className="mt-4 text-sm text-zinc-400">
                                for{" "}
                                <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-orange-500">
                                    {phone}
                                </span>
                            </p>
                            <p className="mt-2 text-xs text-zinc-500">
                                Host will need to change this on first login
                            </p>
                        </div>
                    </div>

                    <div className="space-y-6 mb-8">
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Temporary Password (min 6 characters)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-full border border-white/10 bg-white/5 px-6 py-4 text-center text-base text-white placeholder-zinc-500 transition-all duration-300 focus:border-pink-500/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                👁️
                            </button>
                        </div>

                        <div className="relative">
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm Temporary Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full rounded-full border border-white/10 bg-white/5 px-6 py-4 text-center text-base text-white placeholder-zinc-500 transition-all duration-300 focus:border-pink-500/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
                                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                            >
                                👁️
                            </button>
                        </div>

                        {passwordError && (
                            <p className="text-sm text-red-400 text-center font-medium">{passwordError}</p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleCreatePassword}
                        disabled={!isPasswordValid || loading}
                        className="w-full rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-6 py-4 font-bold text-white shadow-lg transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed hover:disabled:shadow-lg hover:enabled:shadow-xl hover:enabled:shadow-pink-500/30 active:scale-95 active:disabled:scale-100 mb-6"
                    >
                        {loading ? "Creating Account..." : "Create Host Account"}
                    </button>

                    <div className="flex justify-center mb-12">
                        <button
                            onClick={handleBack}
                            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-300 transition hover:text-white"
                        >
                            <span>←</span> Back to email
                        </button>
                    </div>

                    <footer className="flex items-center justify-center gap-4 text-sm font-medium text-zinc-400">
                        <Link href="#" className="transition hover:text-zinc-300">Privacy Policy</Link>
                        <span>|</span>
                        <Link href="#" className="transition hover:text-zinc-300">Terms &amp; Conditions</Link>
                    </footer>
                </div>
            </section>
        </main>
    );
}