"use client";
import { useEffect, useState } from "react";
import FollowButton from "./FollowButton";

type Post = {
  id: string;
  title: string;
  playerName: string;
};

export default function FeedExample({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    // Load initial feed — replace with real API
    async function load() {
      const res = await fetch("/api/playershome?limit=20");
      const json = await res.json();
      const loaded: Post[] = (json.posts || []).map((p: { id: string; title?: string; playerName?: string }) => ({ id: p.id, title: p.title || "", playerName: p.playerName || "" }));
      setPosts(loaded);
    }
    load().catch(() => {});
  }, []);

  function handleUnfollow(playerName: string) {
    // Remove posts related to this player from local feed state
    setPosts((prev) => prev.filter((p) => p.playerName.toLowerCase() !== playerName.toLowerCase()));
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Your Feed</h2>
      {posts.length === 0 && <p>No posts</p>}
      <ul>
        {posts.map((post) => (
          <li key={post.id} className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">{post.playerName}</div>
                <div className="font-medium">{post.title}</div>
              </div>
              <FollowButton
                userId={userId}
                userEmail={userEmail}
                playerName={post.playerName}
                className="btn"
                onUnfollow={handleUnfollow}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
