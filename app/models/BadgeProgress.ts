export interface BadgeProgress {
  badgeId: string;
  uid: string;
  unlocked: boolean;
  progress: number;
  earnedAt?: number;
}
