"use client";

import { Suspense } from "react";
import AddBattleArenaForm from "./AddBattleArenaForm";

export default function AddBattleArenaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
        </div>
      }
    >
      <AddBattleArenaForm />
    </Suspense>
  );
}
