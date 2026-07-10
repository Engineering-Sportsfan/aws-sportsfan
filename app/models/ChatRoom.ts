export interface ChatRoom {
  roomId: string;
  name: string;
  icon?: string;
  sport?: string;
  description?: string;
  createdAt: number;
  isActive: boolean;
  fanCount: number;
  scheduledStartTime?: number;
  score?: string;
  scoreSubtitle?: string;
  watchAlongRoomId?: string;
}
