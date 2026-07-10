
'use client';

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import FanBattleQuizBuilder from "@/components/Fanbattle-component/Fanbattle";




function AddFanBattlePage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id"); // null → create mode, "quiz_xxx" → edit mode

  return <FanBattleQuizBuilder quizIdToEdit={id ?? undefined} />;
}

// ─── Page export 

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1440px] mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-white">Fan Battle Quiz</h1>
          </div>
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-4 animate-pulse">
            <div className="grid grid-cols-2 gap-6">
              <div className="h-10 bg-gray-700 rounded" />
              <div className="h-10 bg-gray-700 rounded" />
            </div>
            <div className="h-14 bg-gray-700 rounded-lg" />
            <div className="h-14 bg-gray-700 rounded-lg" />
            <div className="h-12 bg-gray-700 rounded-lg" />
          </div>
        </div>
      }
    >
      <AddFanBattlePage />
    </Suspense>
  );
}