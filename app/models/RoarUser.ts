// export interface User {
//   uid: string;
//   username: string;
//   handle: string;
//   sports: string[];
//   teams: string[];
//   tenure: "rising" | "seasoned" | "og";
//   badge: string;
//   badgesUnlocked: string[];
//   fanSince: string;
//   reputationScore: number;
//   predictionCount: number;
//   correctPredictions: number;
//   hotTakeCount: number;
//   rank: number;
//   rivalUid: string | null;
//   fcmToken: string | null;
//   settings: {
//     showPredictionHistory: boolean;
//     audience: string;
//   };
//   createdAt: number;
//   updatedAt: number;
// }



export interface User {
  uid: string;
  username: string;
  handle: string;
  sports: string[];
  teams?: string[];
  tenure?: "rising" | "seasoned" | "og";
  badge: string;
  badgesUnlocked: string[];
  fanSince?: string;
  reputationScore: number;
  predictionCount: number;
  correctPredictions: number;
  hotTakeCount: number;
  rank: number;
  rivalUid: string | null;
  fcmToken: string | null;
  settings: {
    showPredictionHistory: boolean;
    audience: string;
  };
  createdAt: number;
  updatedAt: number;
}