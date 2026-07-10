export interface RoomData {
  userId?: string;
  status: "draft" | "published";
  currentStep: number;
  event: {
    selectedEvent: {
      id: string;
      name: string;
    };
    roomType: "open" | "inner" | "moment" | "reflection";
  };
  details: {
    title: string;
    description: string;
    thumbnail: string | null;
    capacity: number;
    primaryLanguage: string;
    tags: string[];
    moderators: string[];
    schedule: string;
  };
  content: {
    assets: Array<{
      type: "video" | "image" | "slide";
      url: string;
      name: string;
      size?: number;
    }>;
  };
  pricing: {
    pricePerFan: number;
    currency: string;
    estimatedAttendance?: {
      low: number;
      high: number;
    };
    estimatedEarnings?: {
      low: number;
      high: number;
    };
  };
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}