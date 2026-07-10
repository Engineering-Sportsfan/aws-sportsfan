export type PollOption = {
  id: string;
  text: string;
  votes: number;
};

export type Poll = {
  id?: string;
  options: PollOption[];
  totalVotes: number;
  endsAt: number; // timestamp — 24 hours from creation
  createdAt: number;
  votedBy?: string[]; // array of user IDs or session tokens
};

export type MediaItem = {
  url: string;
  type: "image" | "video";
  name?: string;
};

export type Post = {
  id?: string;
  userName: string;
  userAvatar?: string;
  userHandle: string;
  content: string;
  media?: MediaItem[];
  poll?: Poll | null;
  userEmail: string;
  likes: 0;
  likedBy: [];
  removed?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CreatePostPayload = {
  userName: string;
  userAvatar?: string;
  userHandle: string;
  content: string;
  media?: MediaItem[];
  poll?: {
    options: string[]; // just the text strings; server builds full PollOption[]
  } | null;
};

export type UpdatePostPayload = Partial<
  Pick<Post, "content" | "media" | "poll">
>;

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type PaginatedPostsResponse = {
  success: boolean;
  posts: Post[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: {
      lastDocId: string;
      lastDocCreatedAt: number;
    } | null;
  };
};