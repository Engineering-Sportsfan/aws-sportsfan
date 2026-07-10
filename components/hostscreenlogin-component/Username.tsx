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

interface UsernameEntryProps {
    onUsernameSubmit?: (username: string) => void;
    loading?: boolean;
}

export default function UsernameEntry({ onUsernameSubmit, loading = false }: UsernameEntryProps) {
    const [username, setUsername] = useState("");

    const handleContinue = () => {
        if (!username.trim()) {
            alert("Please enter username/email");
            return;
        }
        
        if (onUsernameSubmit) {
            onUsernameSubmit(username);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && username.trim() && !loading) {
            handleContinue();
        }
    };

    return (
        <main className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-black px-4 text-white sm:px-6`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(255,48,111,0.25),transparent_38%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_80%,rgba(255,140,65,0.12),transparent_42%)]" />

            <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-[520px] flex-col pt-10 pb-6 sm:pt-14 sm:pb-10 lg:pt-16 lg:pb-10 xl:max-w-[543px] xl:pt-20 xl:pb-12">
                <div className="flex justify-center">
                    <svg className="h-[92px] w-[77px] sm:h-[108px] sm:w-[91px] lg:h-[120px] lg:w-[101px] xl:h-[132px] xl:w-[111px]" viewBox="0 0 120 143" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="sportsfanLogoGradient" x1="0" y1="71.43" x2="120" y2="71.43" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#FF1379" />
                                <stop offset="1" stopColor="#FE7604" />
                            </linearGradient>
                        </defs>
                        <path d="M56.824 0.097C54.024 0.29 51.224 0.579 48.472 1.159C39.878 2.848 32.009 6.228 24.912 11.346C18.201 16.174 12.746 22.112 8.497 29.161C8.353 29.402 8.256 29.692 8.111 29.933C8.208 30.03 8.256 30.078 8.353 30.127C13.132 32.492 17.912 34.858 22.788 37.224C22.981 36.982 23.126 36.789 23.271 36.548C25.057 33.796 27.085 31.237 29.45 28.968C37.078 21.533 46.203 17.429 56.776 16.56C61.121 16.222 65.37 16.56 69.618 17.526C82.895 20.519 94.047 29.595 99.696 42.003C101.53 46.011 102.689 50.163 103.269 54.459C103.413 55.57 103.51 56.68 103.51 57.791C103.51 60.494 103.317 63.15 102.979 65.805C102.544 69.523 101.82 73.24 100.806 76.861C97.041 90.331 90.04 101.87 79.902 111.526C74.205 116.933 67.784 121.278 60.735 124.658C60.493 124.754 60.204 124.899 59.963 124.996C53.252 121.858 47.217 117.899 41.713 112.974C37.947 109.643 32.589 103.753 31.526 101.773C32.492 101.242 33.554 100.76 34.616 100.325C35.678 99.842 36.692 99.408 37.803 98.973C38.865 98.539 39.927 98.152 40.989 97.766C42.099 97.38 43.161 96.994 44.272 96.656C45.334 96.318 46.444 95.98 47.555 95.69C48.617 95.352 49.727 95.111 50.789 94.821C51.9 94.58 53.059 94.29 54.169 94.049C55.279 93.856 56.438 93.614 57.549 93.421C58.659 93.276 59.818 93.083 60.928 92.938C62.087 92.793 63.245 92.649 64.356 92.552C65.515 92.407 66.625 92.359 67.735 92.262C67.784 92.117 67.832 92.069 67.832 92.021C67.832 91.924 67.832 91.828 67.784 91.779C66.818 86.469 65.804 81.206 64.839 75.944C64.839 75.896 64.839 75.896 64.79 75.847C64.79 75.847 64.742 75.847 64.694 75.799C64.018 75.702 63.294 75.847 62.618 75.896C59.48 76.185 56.39 76.62 53.3 77.199C46.444 78.454 39.782 80.289 33.264 82.8C30.078 84.006 26.892 85.407 23.802 86.903C23.512 87.048 23.271 87.241 22.933 87.193C21.726 84.972 19.457 78.406 18.443 73.82C17.96 71.888 17.574 69.957 17.332 67.929C18.829 67.06 20.326 66.24 21.822 65.515C23.367 64.743 24.912 64.019 26.457 63.343C28.002 62.667 29.547 62.039 31.14 61.46C32.733 60.881 34.326 60.301 35.968 59.818C37.609 59.287 39.251 58.805 40.892 58.37C42.534 57.984 44.175 57.598 45.865 57.26C47.507 56.922 49.196 56.632 50.838 56.342C52.528 56.101 54.217 55.956 55.907 55.763C57.597 55.618 59.238 55.522 60.976 55.377C61.025 54.991 60.928 54.653 60.88 54.315C60.687 53.494 60.542 52.673 60.397 51.852C59.625 47.749 58.9 43.693 58.128 39.589C58.08 39.348 58.08 39.058 57.838 38.865C57.693 38.865 57.5 38.865 57.355 38.865C55.955 39.01 54.604 39.106 53.204 39.203C50.548 39.493 47.845 39.879 45.189 40.313C39.203 41.424 33.313 42.921 27.567 44.948C18.008 48.28 9.077 52.866 0.725 58.611C0.483 58.756 0.193 58.949 0 59.142C0 59.287 0 59.432 0 59.529C0.145 63.102 0.387 66.626 0.918 70.15C1.497 74.158 2.366 78.068 3.428 81.931C10.38 106.36 27.085 126.734 49.631 138.369C52.817 140.011 56.052 141.459 59.383 142.715C59.818 142.859 60.204 142.956 60.59 142.715C60.638 142.715 60.735 142.666 60.783 142.666C72.901 138.031 83.619 131.176 92.84 122.051C104.331 110.657 112.248 97.187 116.642 81.641C117.8 77.585 118.621 73.482 119.2 69.33C119.394 67.64 119.587 65.95 119.732 64.26C119.973 61.46 120.118 58.66 119.876 55.859C119.635 52.625 119.152 49.39 118.428 46.252C114.711 30.368 104.524 16.56 90.426 8.304C82.412 3.573 73.77 0.917 64.501 0.193C63.004 0.048 61.556 0 60.059 0C58.997 0 57.935 0.048 56.824 0.097Z" fill="url(#sportsfanLogoGradient)" />
                    </svg>
                </div>

                <div className="mt-5 text-center sm:mt-7 lg:mt-8">
                    <h1 className={`${titleFont.className} bg-gradient-to-b from-white to-[#b6b6b6] bg-clip-text text-[34px] font-semibold uppercase leading-none tracking-[0.03em] text-transparent sm:text-[44px] lg:text-[48px] xl:text-[54px]`}>
                        Create Host Account
                    </h1>
                    <p className="mt-2 text-[14px] text-[#ececec] sm:mt-3 sm:text-[16px] lg:text-[17px]">Enter email for new host account</p>
                </div>

                <div className="mt-8 sm:mt-12 lg:mt-14 xl:mt-16">
                    <input
                        type="email"
                        placeholder="Enter Email Address"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="h-[54px] w-full rounded-[27px] border border-white/10 bg-white/5 px-5 text-center text-[17px] font-medium text-[#ececec] placeholder:text-zinc-500 transition-all duration-300 focus:border-pink-500/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500/20 sm:h-[60px] sm:rounded-[30px] sm:px-6 sm:text-[20px] lg:h-[64px] lg:rounded-[32px] lg:text-[21px] xl:h-[68px] xl:rounded-[34px] xl:text-[22px]"
                        autoFocus
                    />

                    <button
                        type="button"
                        onClick={handleContinue}
                        disabled={!username.trim() || loading}
                        className="mt-8 h-[54px] w-full rounded-[27px] border border-white/10 bg-white/5 text-[18px] font-semibold text-zinc-400 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 enabled:text-white hover:enabled:bg-white/10 sm:mt-12 sm:h-[60px] sm:rounded-[30px] sm:text-[21px] lg:mt-14 lg:h-[64px] lg:rounded-[32px] lg:text-[22px] xl:h-[68px] xl:rounded-[34px] xl:text-[24px]"
                    >
                        {loading ? "Creating..." : "Continue"}
                    </button>
                </div>

                <footer className="mt-auto pt-8 text-center text-[12px] text-[#ececec] sm:pt-10 sm:text-[13px] lg:pt-12 lg:text-[14px]">
                    <p className="text-[#ececec]">By proceeding, you agree to SportsFan360&apos;s</p>
                    <div className="mx-auto mt-3 flex max-w-[450px] items-center justify-center gap-3 text-[#ececec] sm:mt-4 sm:gap-4">
                        <Link href="#" className="hover:text-white">Privacy Policy</Link>
                        <span className="h-4 w-px bg-white/20" />
                        <Link href="#" className="hover:text-white">Terms &amp; Conditions</Link>
                    </div>
                </footer>
            </section>
        </main>
    );
}