import { Suspense } from "react";
import LoginContent from "./logincontent";

export default function AdminLoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-[#3a0000] via-black to-[#120000]">
                <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    Loading...
                </div>
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}