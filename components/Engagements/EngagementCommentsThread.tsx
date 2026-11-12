"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, Heart, CornerDownRight, Send, Loader2 } from "lucide-react";
import type { EngagementComment } from "@/types/engagements";

interface Props {
  engagementId: string;
  isOpen?: boolean;
  onCommentsCountChange?: (newCount: number) => void;
  onCommentCountChange?: (newCount: number) => void;
  accentColor?: string;
}

export default function EngagementCommentsThread({
  engagementId,
  isOpen = true,
  onCommentsCountChange,
  onCommentCountChange,
  accentColor,
}: Props) {
  const notifyCount = onCommentCountChange || onCommentsCountChange;
  const [comments, setComments] = useState<EngagementComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Replying state: tracks which commentId is currently being replied to
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Local likes tracking
  const [likedCommentIds, setLikedCommentIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen && engagementId) {
      fetchComments();
    }
  }, [isOpen, engagementId]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/comments`);
      const data = await res.json();
      if (data.success && Array.isArray(data.comments)) {
        setComments(data.comments);
        if (notifyCount && typeof data.totalCount === "number") {
          notifyCount(data.totalCount);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch engagement comments:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newCommentText.trim() }),
      });
      const data = await res.json();
      if (data.success && data.comment) {
        setComments((prev) => [data.comment, ...prev]);
        setNewCommentText("");
        if (notifyCount) {
          notifyCount(comments.length + 1);
        }
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostReply = async (parentCommentId: string) => {
    if (!replyText.trim() || isSubmittingReply) return;

    setIsSubmittingReply(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: replyText.trim(),
          parentId: parentCommentId,
        }),
      });
      const data = await res.json();
      if (data.success && data.comment) {
        setComments((prev) =>
          prev.map((c) => {
            if (c.commentId === parentCommentId) {
              return {
                ...c,
                replies: [...(c.replies || []), data.comment],
              };
            }
            return c;
          })
        );
        setReplyText("");
        setReplyingToId(null);
        if (notifyCount) {
          notifyCount(comments.length + 1);
        }
      }
    } catch (err) {
      console.error("Failed to post reply:", err);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleToggleLikeComment = async (commentId: string) => {
    const isCurrentlyLiked = Boolean(likedCommentIds[commentId]);
    const nextLiked = !isCurrentlyLiked;

    // Optimistically update local state
    setLikedCommentIds((prev) => ({ ...prev, [commentId]: nextLiked }));

    const updateLikesInTree = (list: EngagementComment[]): EngagementComment[] =>
      list.map((c) => {
        if (c.commentId === commentId) {
          return {
            ...c,
            likesCount: Math.max(0, (c.likesCount || 0) + (nextLiked ? 1 : -1)),
            isLiked: nextLiked,
          };
        }
        if (c.replies && c.replies.length > 0) {
          return { ...c, replies: updateLikesInTree(c.replies) };
        }
        return c;
      });

    setComments((prev) => updateLikesInTree(prev));

    try {
      await fetch(`/api/engagements/${engagementId}/comments/${commentId}/like`, {
        method: "POST",
      });
    } catch (err) {
      console.warn("Failed to sync comment like:", err);
    }
  };

  const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return "Just now";
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: "1px solid #21262d",
        fontSize: 13,
      }}
    >
      {/* Thread Title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#8b949e",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <MessageSquare size={13} color="#58a6ff" /> Fan Banter & Discussion
        </span>
        <span style={{ fontSize: 11, color: "#8b949e" }}>
          {comments.length} comments
        </span>
      </div>

      {/* Post a Comment Form */}
      <form onSubmit={handlePostComment} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Share your opinion or react to this moment..."
            style={{
              flex: 1,
              background: "#0d1117",
              border: "1px solid #30363d",
              borderRadius: 6,
              padding: "8px 12px",
              color: "#f0f6fc",
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!newCommentText.trim() || isSubmitting}
            style={{
              background: "#238636",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: !newCommentText.trim() || isSubmitting ? "not-allowed" : "pointer",
              opacity: !newCommentText.trim() || isSubmitting ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Post
          </button>
        </div>
      </form>

      {/* Comments List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "16px 0", color: "#8b949e", fontSize: 12 }}>
          Loading live banter...
        </div>
      ) : comments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "14px 0", color: "#6e7681", fontSize: 12 }}>
          No comments yet. Be the first fan to react!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {comments.map((comment) => {
            const isLiked = Boolean(likedCommentIds[comment.commentId] || comment.isLiked);
            const isReplying = replyingToId === comment.commentId;

            return (
              <div
                key={comment.commentId}
                style={{
                  background: "#0d1117",
                  border: "1px solid #21262d",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                {/* Author Info & Timestamp */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "#21262d",
                        border: "1px solid #30363d",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#58a6ff",
                      }}
                    >
                      {comment.authorUsername?.slice(0, 1).toUpperCase() || "F"}
                    </div>
                    <span style={{ fontWeight: 600, color: "#f0f6fc", fontSize: 12 }}>
                      {comment.authorUsername || "SportsFan"}
                    </span>
                    {comment.authorBadge && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#7ee787",
                          background: "rgba(46,160,67,0.15)",
                          padding: "1px 4px",
                          borderRadius: 3,
                        }}
                      >
                        {comment.authorBadge}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "#6e7681" }}>
                    {formatTimeAgo(comment.createdAt)}
                  </span>
                </div>

                {/* Comment Text */}
                <div style={{ color: "#c9d1d9", fontSize: 12, lineHeight: 1.4, marginBottom: 8 }}>
                  {comment.text}
                </div>

                {/* Comment Actions: Like & Reply */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button
                    type="button"
                    onClick={() => handleToggleLikeComment(comment.commentId)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      color: isLiked ? "#f85149" : "#8b949e",
                      padding: 0,
                    }}
                  >
                    <Heart size={12} fill={isLiked ? "#f85149" : "none"} />
                    <span>{comment.likesCount || 0}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToId(isReplying ? null : comment.commentId);
                      setReplyText("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      color: isReplying ? "#58a6ff" : "#8b949e",
                      padding: 0,
                    }}
                  >
                    <CornerDownRight size={12} />
                    <span>Reply</span>
                  </button>
                </div>

                {/* Inline Reply Input Box */}
                {isReplying && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px solid #21262d",
                      display: "flex",
                      gap: 6,
                    }}
                  >
                    <input
                      type="text"
                      autoFocus
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Replying to @${comment.authorUsername}...`}
                      style={{
                        flex: 1,
                        background: "#161b22",
                        border: "1px solid #30363d",
                        borderRadius: 4,
                        padding: "5px 8px",
                        fontSize: 11,
                        color: "#f0f6fc",
                        outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      disabled={!replyText.trim() || isSubmittingReply}
                      onClick={() => handlePostReply(comment.commentId)}
                      style={{
                        background: "#238636",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "0 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: !replyText.trim() || isSubmittingReply ? "not-allowed" : "pointer",
                      }}
                    >
                      {isSubmittingReply ? "..." : "Send"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyingToId(null)}
                      style={{
                        background: "#21262d",
                        color: "#8b949e",
                        border: "1px solid #30363d",
                        borderRadius: 4,
                        padding: "0 8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Nested Threaded Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingLeft: 12,
                      borderLeft: "2px solid #30363d",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {comment.replies.map((reply) => {
                      const isReplyLiked = Boolean(
                        likedCommentIds[reply.commentId] || reply.isLiked
                      );
                      return (
                        <div
                          key={reply.commentId}
                          style={{
                            background: "#161b22",
                            border: "1px solid #21262d",
                            borderRadius: 6,
                            padding: "6px 10px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 2,
                            }}
                          >
                            <span style={{ fontWeight: 600, color: "#f0f6fc", fontSize: 11 }}>
                              {reply.authorUsername || "SportsFan"}
                            </span>
                            <span style={{ fontSize: 9, color: "#6e7681" }}>
                              {formatTimeAgo(reply.createdAt)}
                            </span>
                          </div>
                          <div style={{ color: "#c9d1d9", fontSize: 11, marginBottom: 4 }}>
                            {reply.text}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => handleToggleLikeComment(reply.commentId)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                fontSize: 10,
                                color: isReplyLiked ? "#f85149" : "#8b949e",
                                padding: 0,
                              }}
                            >
                              <Heart size={10} fill={isReplyLiked ? "#f85149" : "none"} />
                              <span>{reply.likesCount || 0}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

