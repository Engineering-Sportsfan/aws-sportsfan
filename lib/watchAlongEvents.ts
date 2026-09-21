// lib/watchAlongEvents.ts
import { EventEmitter } from "events";

export interface WatchAlongEvent {
  type: "NEW_QUIZ" | "QUIZ_ANSWERED" | "NEW_PREDICTION" | "PREDICTION_VOTE" | "NEW_CHAT" | "DELETE_CHAT" | "ROOM_UPDATE" | string;
  timestamp: number;
  [key: string]: any;
}

const GLOBAL_EMITTERS_KEY = Symbol.for("sportsfan.watchalong.emitters");

// Preserve emitters across Next.js dev hot-reloads
const matchEmitters: Map<string, EventEmitter> =
  (global as any)[GLOBAL_EMITTERS_KEY] || new Map<string, EventEmitter>();

if (process.env.NODE_ENV !== "production") {
  (global as any)[GLOBAL_EMITTERS_KEY] = matchEmitters;
}

/**
 * Get or create the event emitter for a specific match room.
 */
export function getMatchEmitter(matchId: string): EventEmitter {
  let emitter = matchEmitters.get(matchId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(500); // Allow many concurrent viewer SSE connections
    matchEmitters.set(matchId, emitter);
  }
  return emitter;
}

/**
 * Broadcast an event to all connected SSE clients in a match room.
 */
export function broadcastMatchEvent(
  matchId: string,
  eventData: { type: WatchAlongEvent["type"]; timestamp?: number; [key: string]: any }
) {
  const emitter = matchEmitters.get(matchId);
  if (!emitter) return;

  const { type, timestamp, ...rest } = eventData;
  const payload: WatchAlongEvent = {
    type,
    timestamp: timestamp ?? Date.now(),
    ...rest,
  };

  emitter.emit("match_event", payload);
}
