"use client";
import { useEffect, useState } from "react";

type FollowItem = {
  followingplayername?: string | null;
};

type Props = {
  userId: string;
  userEmail: string;
  playerName: string;
  className?: string;
  // Called after a successful unfollow so parent can remove related feed items
  onUnfollow?: (playerName: string) => void;
};

export default function FollowButton({ userId, userEmail, playerName, className, onUnfollow }: Props) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;

    fetch(`/api/following?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => {
        const list: FollowItem[] = data?.following || [];
        const found = list.some((f: FollowItem) =>
          (f.followingplayername || "").toLowerCase() === playerName.toLowerCase()
        );
        setIsFollowing(Boolean(found));
      })
      .catch(() => {
        // ignore
      });
  }, [userId, playerName]);

  async function handleFollow() {
    if (!userId || !userEmail) return;
    setLoading(true);
    try {
      const res = await fetch("/api/following", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userEmail, followingplayername: playerName }),
      });

      if (res.ok) {
        setIsFollowing(true);
      }
    } catch (err) {
      console.error("Follow failed", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnfollow() {
    if (!userId) return;
    setLoading(true);
    try {
      // Use DELETE with query params
      const url = `/api/following?userId=${encodeURIComponent(userId)}&followingplayername=${encodeURIComponent(
        playerName
      )}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        setIsFollowing(false);
        // Let parent remove related feed items
        onUnfollow?.(playerName);
      }
    } catch (err) {
      console.error("Unfollow failed", err);
    } finally {
      setLoading(false);
    }
  }

  if (isFollowing) {
    return (
      <button className={className} onClick={handleUnfollow} disabled={loading}>
        {loading ? "Removing…" : "Following — Unfollow"}
      </button>
    );
  }

  return (
    <button className={className} onClick={handleFollow} disabled={loading}>
      {loading ? "Please wait…" : "Follow"}
    </button>
  );
}
