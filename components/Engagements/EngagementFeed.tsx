"use client";

import React, { useEffect, useState } from "react";
import { EngagementItem } from "@/types/engagements";
import EngagementCard from "./EngagementCard";

interface Props {
  sport?: string;
  type?: string;
  limit?: number;
}

export default function EngagementFeed({ sport, type, limit = 10 }: Props) {
  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeed();
  }, [sport, type]);

  async function fetchFeed() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: "active", limit: String(limit) });
      if (sport) params.set("sport", sport);
      if (type) params.set("type", type);

      const res = await fetch(`/api/engagements?${params.toString()}`);
      const data = await res.json();
      setEngagements(data.engagements || []);
    } catch {
      setEngagements([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "#8b949e" }}>
        <div style={{ display: "inline-block", width: 24, height: 24, border: "2px solid #58a6ff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <div style={{ marginTop: 10, fontSize: 13 }}>Loading live fan interactions…</div>
      </div>
    );
  }

  if (engagements.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {engagements.map(item => (
        <EngagementCard key={item.id} item={item} />
      ))}
    </div>
  );
}
