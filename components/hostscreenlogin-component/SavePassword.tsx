'use client';

import Link from "next/link";
import { Manrope, Oswald } from "next/font/google";

const titleFont = Oswald({
    subsets: ["latin"],
    weight: ["500", "600"],
});

const bodyFont = Manrope({
    subsets: ["latin"],
    weight: ["400", "500", "700"],
});

type SavePasswordPromptProps = {
    phone?: string;
    onYes?: () => void;
    onNo?: () => void;
    onBack?: () => void;
    loading?: boolean;
};

export default function SavePasswordPrompt({ phone = "09876543", onYes, onNo, onBack, loading = false }: SavePasswordPromptProps) {
    return (
        <main className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-black px-6 py-12 text-white`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(255,48,111,0.28),transparent_38%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_80%,rgba(255,140,65,0.14),transparent_42%)]" />

            <section className="relative z-10 mx-auto mt-20 w-full max-w-[420px] rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,#121318_0%,#0d0e13_100%)] px-7 pb-9 pt-10 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
                <div className="mx-auto mb-8 flex items-center justify-center drop-shadow-[0_12px_28px_rgba(241,0,98,0.45)]">
                    <svg width="92" height="92" viewBox="0 0 92 92" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M0 45.7356C0 20.4765 20.4765 0 45.7356 0C70.9946 0 91.4712 20.4765 91.4712 45.7356C91.4712 70.9946 70.9946 91.4712 45.7356 91.4712C20.4765 91.4712 0 70.9946 0 45.7356Z" fill="url(#paint0_linear_save_password_key)" />
                        <path d="M52.0864 35.1485C53.2095 35.1485 54.2867 35.5946 55.0808 36.3888C55.875 37.183 56.3212 38.2601 56.3212 39.3832M64.7907 39.3832C64.7913 41.3676 64.327 43.3245 63.4351 45.0971C62.5432 46.8697 61.2485 48.4088 59.6547 49.5909C58.0609 50.773 56.2123 51.5654 54.2571 51.9044C52.302 52.2435 50.2946 52.1199 48.3958 51.5434L43.6168 56.3223H39.3821V60.5571H35.1473V64.7919H28.7951C28.2336 64.7919 27.695 64.5688 27.2979 64.1717C26.9008 63.7746 26.6777 63.2361 26.6777 62.6745V57.1989C26.6779 56.6374 26.901 56.0989 27.2981 55.702L39.9262 43.0738C39.3978 41.327 39.252 39.4869 39.4986 37.6786C39.7452 35.8704 40.3786 34.1365 41.3554 32.595C42.3323 31.0535 43.6299 29.7405 45.1598 28.7455C46.6896 27.7505 48.4159 27.0968 50.2211 26.8288C52.0263 26.5609 53.8681 26.685 55.621 27.1928C57.374 27.7005 58.9969 28.58 60.3794 29.7713C61.762 30.9626 62.8716 32.4378 63.6328 34.0964C64.394 35.7551 64.789 37.5583 64.7907 39.3832Z" stroke="white" strokeWidth="5.29348" strokeLinecap="round" strokeLinejoin="round" />
                        <defs>
                            <linearGradient id="paint0_linear_save_password_key" x1="7.45507e-08" y1="31.4432" x2="91.4712" y2="60.0279" gradientUnits="userSpaceOnUse">
                                <stop offset="0.016129" stopColor="#CA0049" />
                                <stop offset="0.92258" stopColor="#FF6A3D" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>

                <h1 className={`${titleFont.className} text-center text-[2.1rem] uppercase leading-none tracking-tight`}>
                    Account Created!
                </h1>

                <p className="mx-auto mt-5 max-w-[18rem] text-center text-[1.16rem] leading-7 text-zinc-300">
                    Host account created for{" "}
                    <span className="font-bold text-[#ff2f85]">{phone}</span>
                </p>

                <p className="mx-auto mt-3 max-w-[18rem] text-center text-sm text-zinc-400">
                    Temporary password has been set. Please share these credentials with the host.
                </p>

                <div className="mt-8 space-y-4">
                    <button
                        type="button"
                        onClick={onYes}
                        disabled={loading}
                        className="w-full rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-6 py-4 text-lg font-extrabold text-white transition duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                    >
                        {loading ? "Logging in..." : "Yes, Login to Dashboard"}
                    </button>

                    <button
                        type="button"
                        onClick={onNo}
                        disabled={loading}
                        className="w-full rounded-full border border-white/10 bg-white/[0.03] px-6 py-4 text-lg font-bold text-zinc-200 transition duration-200 hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50"
                    >
                        No, Return to Home
                    </button>
                </div>

                {onBack && (
                    <div className="mt-6 flex justify-center">
                        <button
                            onClick={onBack}
                            className="text-sm text-zinc-400 transition hover:text-zinc-200"
                        >
                            ← Back to create password
                        </button>
                    </div>
                )}
            </section>

            <footer className="relative z-10 mx-auto mt-14 flex items-center justify-center gap-4 text-sm font-medium text-zinc-400">
                <Link href="#" className="transition hover:text-zinc-200">
                    Privacy Policy
                </Link>
                <span className="text-zinc-600">|</span>
                <Link href="#" className="transition hover:text-zinc-200">
                    Terms &amp; Conditions
                </Link>
            </footer>
        </main>
    );
}