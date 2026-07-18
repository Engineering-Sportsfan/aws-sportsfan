export interface Channel {
    channelId: string;
    roomId: string;
    name: string;        // "Cricket"
    slug: string;         // "cricket" (lowercase, no spaces)
    icon?: string;        // emoji, e.g. "🏏"
    isActive: boolean;
    order: number;
    createdAt: number;
}