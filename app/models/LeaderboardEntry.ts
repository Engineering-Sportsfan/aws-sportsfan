export interface LeaderboardEntry {
  uid: string;
  username: string;
  badge: string;
  team: string;
  accuracy: number;
  predictions: number;
  reputationScore: number;
  rank: number;
}

export interface Leaderboard {
  period: string;
  entries: LeaderboardEntry[];
  updatedAt: number;
}
