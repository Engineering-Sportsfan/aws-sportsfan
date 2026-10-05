"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RedirectAddContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");

  useEffect(() => {
    if (editId) {
      router.replace(`/admin/homecardmanagement/Schedule/add?editId=${editId}`);
    } else {
      router.replace("/admin/homecardmanagement/Schedule/add");
    }
  }, [router, editId]);

  return (
    <div className="p-12 text-center text-gray-400">
      <p className="text-sm">Redirecting to Schedule Form...</p>
    </div>
  );
}

export default function TodaysAgendaAddRedirect() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-400">Redirecting to Schedule Form...</div>}>
      <RedirectAddContent />
    </Suspense>
  );
}
