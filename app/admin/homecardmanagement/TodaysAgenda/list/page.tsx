"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TodaysAgendaListRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/homecardmanagement/Schedule/list");
  }, [router]);

  return (
    <div className="p-12 text-center text-gray-400">
      <p className="text-sm">Redirecting to Schedule List...</p>
    </div>
  );
}
