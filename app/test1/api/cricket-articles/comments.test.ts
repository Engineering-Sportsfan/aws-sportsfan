import test from "node:test";
import assert from "node:assert/strict";

type RawCommentInput = {
  id?: string;
  commentId?: string;
  contentId?: string;
  articleId?: string;
  targetContentId?: string;
  commentText?: string;
  text?: string;
  content?: string;
  userId?: string;
  authorUid?: string;
  userName?: string;
  authorName?: string;
  userAvatar?: string;
  authorAvatarUrl?: string;
  userEmail?: string;
  authorEmail?: string;
  likes?: number;
  likedBy?: string[];
  replyCount?: number;
  parentCommentId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  timestamp?: number;
  isFlagged?: boolean;
};

function normalizeTestComment(c: RawCommentInput, fallbackArticleId?: string) {
  const commentId = String(
    c.commentId ||
    c.id ||
    ""
  );

  const cleanArticleId = fallbackArticleId ||
    String(c.articleId || c.contentId || c.targetContentId || "")
      .replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST)#/i, "")
      .trim();

  const text = String(
    c.commentText ??
    c.text ??
    c.content ??
    ""
  ).trim();

  const userId = String(
    c.userId ??
    c.authorUid ??
    ""
  ).trim();

  const userName = String(
    c.userName ??
    c.authorName ??
    "Fan"
  ).trim();

  const userAvatar = String(
    c.userAvatar ??
    c.authorAvatarUrl ??
    ""
  ).trim();

  const userEmail = String(
    c.userEmail ??
    c.authorEmail ??
    ""
  ).trim();

  const createdAt = Number(c.createdAt || c.timestamp || Date.now());
  const updatedAt = Number(c.updatedAt || c.createdAt || createdAt);
  const likes = typeof c.likes === "number" ? c.likes : Array.isArray(c.likedBy) ? c.likedBy.length : 0;
  const likedBy = Array.isArray(c.likedBy) ? c.likedBy : [];
  const replyCount = typeof c.replyCount === "number" ? c.replyCount : 0;
  const parentCommentId = c.parentCommentId || null;

  return {
    id: commentId,
    commentId,
    contentId: cleanArticleId,
    targetContentId: cleanArticleId,
    articleId: cleanArticleId,
    contentType: "article",
    userId,
    authorUid: userId,
    userName,
    authorName: userName,
    userAvatar,
    authorAvatarUrl: userAvatar,
    userEmail,
    authorEmail: userEmail,
    commentText: text,
    text,
    likes,
    likeCount: likes,
    likedBy,
    replyCount,
    parentCommentId,
    isFlagged: Boolean(c.isFlagged),
    createdAt,
    updatedAt,
    timestamp: createdAt,
  };
}

function parseTestArticleId(pathname: string, searchParams: Record<string, string> = {}, params?: { id?: string }) {
  if (params?.id) {
    const decoded = decodeURIComponent(params.id).trim();
    if (decoded && !["comments", "comment", "cricket-articles"].includes(decoded.toLowerCase())) {
      return decoded;
    }
  }

  const queryId = searchParams.articleId || searchParams.contentId || searchParams.id || searchParams.content_id;
  if (queryId && queryId.trim()) {
    return decodeURIComponent(queryId.trim());
  }

  const parts = pathname.split("/").filter(Boolean);
  const idIdx = parts.indexOf("cricket-articles");
  if (idIdx !== -1 && parts[idIdx + 1]) {
    const nextPart = decodeURIComponent(parts[idIdx + 1]).trim();
    if (!["comments", "comment", "like", "likes", "view", "views"].includes(nextPart.toLowerCase())) {
      return nextPart;
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart === "comments" || lastPart === "comment") {
    const prevPart = parts[parts.length - 2];
    if (prevPart && !["cricket-articles", "api"].includes(prevPart.toLowerCase())) {
      return decodeURIComponent(prevPart.trim());
    }
  } else if (lastPart && !["cricket-articles", "api"].includes(lastPart.toLowerCase())) {
    return decodeURIComponent(lastPart.trim());
  }

  return "";
}

function applyLikeToggle(currentLikes: number, currentLikedBy: string[], userId: string, action: "like" | "unlike" | "toggle") {
  let likedBy = [...currentLikedBy];
  let likes = currentLikes;
  const isCurrentlyLiked = likedBy.includes(userId);

  if (action === "toggle") {
    if (isCurrentlyLiked) {
      likedBy = likedBy.filter((u) => u !== userId);
      likes = Math.max(0, likes - 1);
    } else {
      likedBy.push(userId);
      likes += 1;
    }
  } else if (action === "like" && !isCurrentlyLiked) {
    likedBy.push(userId);
    likes += 1;
  } else if (action === "unlike" && isCurrentlyLiked) {
    likedBy = likedBy.filter((u) => u !== userId);
    likes = Math.max(0, likes - 1);
  }

  return { likes, likedBy, isLiked: likedBy.includes(userId) };
}

test("Article ID parser extracts ID from route params", () => {
  assert.equal(parseTestArticleId("/api/cricket-articles/art_100/comments", {}, { id: "art_100" }), "art_100");
  assert.equal(parseTestArticleId("/api/cricket-articles/ARTICLE%23art_200/comments", {}, { id: "ARTICLE#art_200" }), "ARTICLE#art_200");
});

test("Article ID parser extracts ID from direct comments endpoint query params", () => {
  assert.equal(parseTestArticleId("/api/cricket-articles/comments", { articleId: "art_300" }), "art_300");
  assert.equal(parseTestArticleId("/api/cricket-articles/comments", { contentId: "art_400" }), "art_400");
  assert.equal(parseTestArticleId("/api/cricket-articles/comments", { id: "art_500" }), "art_500");
});

test("Article ID parser does not mistakenly extract 'cricket-articles' as the ID", () => {
  assert.equal(parseTestArticleId("/api/cricket-articles/comments", {}), "");
  assert.equal(parseTestArticleId("/api/cricket-articles/comment", {}), "");
});

test("Comment normalizer produces dual-compatible field aliases", () => {
  const norm = normalizeTestComment({
    id: "cmt_1",
    articleId: "art_test",
    text: "Great innings!",
    authorUid: "user_42",
    authorName: "ViratFan",
    authorAvatarUrl: "https://example.com/avatar.jpg",
    authorEmail: "virat@fan.com",
    likedBy: ["user_1", "user_2"],
    createdAt: 1000,
  });

  assert.equal(norm.id, "cmt_1");
  assert.equal(norm.commentId, "cmt_1");
  assert.equal(norm.contentId, "art_test");
  assert.equal(norm.articleId, "art_test");
  assert.equal(norm.commentText, "Great innings!");
  assert.equal(norm.text, "Great innings!");
  assert.equal(norm.userId, "user_42");
  assert.equal(norm.authorUid, "user_42");
  assert.equal(norm.userName, "ViratFan");
  assert.equal(norm.authorName, "ViratFan");
  assert.equal(norm.likes, 2);
  assert.equal(norm.likeCount, 2);
  assert.equal(norm.replyCount, 0);
  assert.equal(norm.parentCommentId, null);
});

test("Like action toggling updates count and list correctly", () => {
  const initial = applyLikeToggle(0, [], "user_1", "toggle");
  assert.equal(initial.likes, 1);
  assert.equal(initial.likedBy.includes("user_1"), true);
  assert.equal(initial.isLiked, true);

  const toggledOff = applyLikeToggle(initial.likes, initial.likedBy, "user_1", "toggle");
  assert.equal(toggledOff.likes, 0);
  assert.equal(toggledOff.likedBy.includes("user_1"), false);
  assert.equal(toggledOff.isLiked, false);

  const directLike = applyLikeToggle(0, [], "user_2", "like");
  assert.equal(directLike.likes, 1);

  const repeatLike = applyLikeToggle(1, ["user_2"], "user_2", "like");
  assert.equal(repeatLike.likes, 1); // No double count

  const directUnlike = applyLikeToggle(1, ["user_2"], "user_2", "unlike");
  assert.equal(directUnlike.likes, 0);
});

test("Replies maintain parentCommentId reference", () => {
  const reply = normalizeTestComment({
    id: "cmt_reply_1",
    contentId: "art_100",
    commentText: "I agree with you!",
    userId: "user_99",
    parentCommentId: "cmt_parent_1",
    createdAt: 2000,
  });

  assert.equal(reply.parentCommentId, "cmt_parent_1");
  assert.equal(reply.contentId, "art_100");
});
