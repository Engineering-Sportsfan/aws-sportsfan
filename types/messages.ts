// types/messages.ts
// Types derived directly from the UI screenshots

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ChatType = "dm" | "group";

export type MessageType = "text" | "image" | "video" | "audio" | "file";

export type GroupPrivacy = "public" | "closed" | "private";

export type GroupRole = "owner" | "admin" | "member";

// ─── My Chats tab ─────────────────────────────────────────────────────────────

/**
 * A single row in the "My Chats" list.
 * Covers both DMs (Rohit Sharma, Virat Kohli) and group chats (MI Fans United, Team KKR).
 */
export interface Chat {
  id: string;
  type: ChatType;

  // DMs: name + avatar derived from the other participant
  // Groups: stored directly on the chat doc
  name: string;
  avatarUrl?: string;

  /** IDs of everyone in this chat */
  participantIds: string[];

  /** Snapshot of the last message — shown as the subtitle in the list */
  lastMessageContent: string;
  lastMessageAt: number; // epoch ms — drives the "2m", "15m", "1h" labels

  /** Badge shown in the top-right corner of the chat row */
  unreadCount: number;

  /** Whether the other participant (DM) or group is online — green dot */
  isOnline: boolean;

  /** Blue verified tick next to name (Rohit Sharma ✓, Virat Kohli ✓) */
  isVerified: boolean;

  isPinned: boolean;
  isMuted: boolean;

  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  replyToId?: string;
  isRead: boolean;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Discover Groups tab ───────────────────────────────────────────────────────

/**
 * A single row in the "Discover Groups" list.
 * Shows: name, description, privacy badge, memberCount, lastActivityAt, isTrending.
 */
export interface Group {
  id: string;
  name: string;          // "Mumbai Indians Official", "IPL 2025 Predictions" …
  description: string;   // subtitle text under the name
  avatarUrl?: string;

  /** Controls the badge colour: blue globe = public, yellow lock = closed/private */
  privacy: GroupPrivacy;

  /** Shown as "125,000" next to the people icon */
  memberCount: number;

  /** "TRENDING" pill in the top-right of the card */
  isTrending: boolean;

  /** Category label shown in pink: "Announcement" */
  category?: string;

  /** "5m ago", "12m ago", "20m ago", "1h ago" */
  lastActivityAt: number;

  isVerified: boolean;
  tags: string[];

  /** Linked chat room — created automatically when a group is created */
  chatId?: string;

  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface GroupMember {
  userId: string;
  groupId: string;
  role: GroupRole;
  joinedAt: number;
}

// ─── Communities tab ───────────────────────────────────────────────────────────

export interface Community {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  memberCount: number;
  groupCount: number;
  isVerified: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}