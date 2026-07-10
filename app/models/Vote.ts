export type VoteType = "agree" | "disagree";

export interface Vote {
  uid: string;
  postId: string;
  vote: VoteType;
  createdAt: number;
}
