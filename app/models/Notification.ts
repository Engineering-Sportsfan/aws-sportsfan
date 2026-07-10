export type NotificationType =
  | "PREDICTION_OK"
  | "PREDICTION_FAIL"
  | "CHALLENGE"
  | "HEATING_UP"
  | "MATCH_LIVE"
  | "BADGE"
  | "RIVAL"
  | "FAN_OF_WEEK"
  | "WEEKLY";

export interface Notification {
  notifId: string;
  uid: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  read: boolean;
  fromUid?: string;
  fromUsername?: string;
  fromBadge?: string;
  cta?: string;
  createdAt: number;
}
