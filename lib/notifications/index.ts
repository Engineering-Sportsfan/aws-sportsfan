// backend/lib/notifications/index.ts

export * from "./types";
export * from "./service";

// Domain Modules: ROAR
export * as roarNotifications from "./roarNotifications";
export {
  notifyPostReaction,
  notifyPostComment,
  notifyRoomMessageComment,
  notifyMentions,
  notifyRoomMessageReaction,
  notifyRoomGoingLive,
  notifyRoomContentAnnounced,
  notifyRoomContentClosingSoon,
  notifyFollowedRoomNewPost,
  notifyPredictionResolved,
  dispatchRoarNotification,
} from "./roarNotifications";

// Domain Modules: FlipArena
export * as fliparenaNotifications from "./fliparenaNotifications";
export {
  dispatchFlipArenaNotification,
  dispatchFlipArenaContentDropNotification,
  formatContentDropMessage,
} from "./fliparenaNotifications";

// Domain Modules: FlipLINE
export * as fliplineNotifications from "./fliplineNotifications";
export {
  extractMentions,
  resolveUserIdsFromHandles,
  dispatchFlipLineNotification,
} from "./fliplineNotifications";

// Domain Modules: FlipLONG
export * as flipLongNotifications from "./flipLongNotifications";
export {
  notifyFlipLongVideoLiked,
  notifyFlipLongProcessingComplete,
  notifyFlipLongVideoPublished,
  dispatchFlipLongNotification,
} from "./flipLongNotifications";

// Domain Modules: Store & Commerce
export * as storeNotifications from "./storeNotifications";
export {
  dispatchStoreNotification,
  STORE_NOTIFICATION_CONFIG,
  DEFAULT_STORE_TITLES,
} from "./storeNotifications";
