import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { QueryCommand, GetCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

export type Reaction =
  | "heart"
  | "fire"
  | "laugh"
  | "smile"
  | "sad"
  | "thumb"
  | "mindblown"
  | "goat"
  | "clap"
  | "nochance"
  | "noChance"
  | "like";

export const VALID_REACTIONS: string[] = [
  "heart",
  "fire",
  "laugh",
  "smile",
  "sad",
  "thumb",
  "mindblown",
  "goat",
  "clap",
  "nochance",
  "noChance",
  "like",
];

export function normalizeReaction(r: string | null | undefined): string | null {
  if (!r) return null;
  const lower = r.toLowerCase().trim();
  if (lower === "smile") return "laugh";
  if (lower === "like") return "heart";
  if (lower === "nochance") return "nochance";
  return lower;
}

export const COUNT_FIELDS: Record<string, string> = {
  heart: "heartCount",
  like: "heartCount",
  fire: "fireCount",
  laugh: "laughCount",
  smile: "laughCount",
  sad: "sadCount",
  thumb: "thumbCount",
  mindblown: "mindblownCount",
  goat: "goatCount",
  clap: "clapCount",
  nochance: "noChanceCount",
  noChance: "noChanceCount",
};

export function reactionCountField(reaction: string | null | undefined): string {
  if (!reaction) return "heartCount";
  const norm = normalizeReaction(reaction) || "heart";
  return COUNT_FIELDS[norm] || `${norm}Count`;
}

export interface FoundRoomMessage {
  msgItem: any;
  roomIdKey: string;
  msgSk: string;
  fromDynamo: boolean;
  rawMsgId: string;
}

/**
 * Robustly finds any room message (user message or bot message like Dolly, Krishna, Radha)
 * across RealTimeChat partitions and Firestore fallbacks.
 */
export async function findRoomMessage(
  roomId: string,
  msgId: string
): Promise<FoundRoomMessage | null> {
  const cleanRoomId = roomId.replace(/^ROOM#/, "");
  const roomCandidates = [`ROOM#${cleanRoomId}`, cleanRoomId];

  for (const rCand of roomCandidates) {
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.RealTimeChat,
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
          ExpressionAttributeValues: {
            ":r": rCand,
            ":p": "MSG#",
          },
        })
      );

      if (qRes.Items && qRes.Items.length > 0) {
        const found = qRes.Items.find((item) => {
          if (item.msgId === msgId || item.chatId === msgId || item.id === msgId) {
            return true;
          }
          const skStr = String(item.sk || "");
          if (skStr.endsWith(`#${msgId}`) || skStr === `MSG#${msgId}` || skStr.includes(msgId)) {
            return true;
          }
          return false;
        });

        if (found) {
          return {
            msgItem: found,
            roomIdKey: rCand,
            msgSk: found.sk,
            fromDynamo: true,
            rawMsgId: found.msgId || msgId,
          };
        }
      }
    } catch (dynErr) {
      console.warn(`[findRoomMessage] DynamoDB query failed for candidate ${rCand}:`, dynErr);
    }
  }

  // Fallback to Firestore
  try {
    const roomRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId);
    let msgSnap = await roomRef.collection("messages").doc(msgId).get();

    if (!msgSnap.exists) {
      const fallbackRef = db.collection(getFirestoreCollection("watchAlongRooms")).doc(cleanRoomId);
      const fallbackSnap = await fallbackRef.collection("messages").doc(msgId).get();
      if (fallbackSnap.exists) {
        msgSnap = fallbackSnap;
      }
    }

    if (msgSnap.exists) {
      const data = msgSnap.data();
      return {
        msgItem: { id: msgSnap.id, msgId: msgSnap.id, ...data },
        roomIdKey: `ROOM#${cleanRoomId}`,
        msgSk: `MSG#${cleanRoomId}#${msgId}`,
        fromDynamo: false,
        rawMsgId: msgSnap.id,
      };
    }
  } catch (fsErr) {
    console.warn("[findRoomMessage] Firestore lookup failed:", fsErr);
  }

  return null;
}

export interface UserProfileInfo {
  userId: string;
  username: string;
  avatarUrl?: string;
  badge?: string;
}

export function formatCleanUsername(raw: string | undefined | null): string {
  if (!raw) return "Fan";
  const trimmed = raw.trim();
  if (!trimmed) return "Fan";

  // If already clean regular string with no underscores or email formatting
  if (!trimmed.includes("_") && !trimmed.includes("@")) {
    return trimmed;
  }

  let namePart = trimmed;
  if (namePart.includes("@")) {
    namePart = namePart.split("@")[0];
  } else {
    // If ends with domain pattern like _sportsfan360_com or _gmail_com
    namePart = namePart.replace(/_([a-zA-Z0-9]+)_(com|org|net|io|in|co)$/i, "");
  }

  const words = namePart.replace(/[._\-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Fan";
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export async function resolveUserProfiles(userIds: string[]): Promise<Map<string, UserProfileInfo>> {
  const profileMap = new Map<string, UserProfileInfo>();
  if (!userIds || userIds.length === 0) return profileMap;

  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const allKeys: { entityId: string; sk: string }[] = [];
  const uidToCandidates = new Map<string, string[]>();

  for (const uid of unique) {
    const cands = new Set<string>();
    cands.add(uid);
    cands.add(uid.toLowerCase().trim());
    if (uid.includes("@")) {
      cands.add(uid.replace(/[@.]/g, "_"));
    }
    if (uid.includes("_")) {
      cands.add(uid.replace(/_([a-zA-Z0-9]+)_([a-zA-Z0-9]+)$/i, "@$1.$2"));
    }
    uidToCandidates.set(uid, Array.from(cands));
    for (const c of cands) {
      allKeys.push({ entityId: `USER#${c}`, sk: "USER#META" });
    }
  }

  // 1. Batch get from DynamoDB
  const foundByCand = new Map<string, any>();
  const chunks: { entityId: string; sk: string }[][] = [];
  for (let i = 0; i < allKeys.length; i += 100) chunks.push(allKeys.slice(i, i + 100));

  for (const chunk of chunks) {
    try {
      const batchRes = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [TABLES.IdentityAndAccess]: { Keys: chunk }
        }
      }));
      const items = batchRes.Responses?.[TABLES.IdentityAndAccess] || [];
      for (const item of items) {
        const rawEntityId = String(item.entityId || "").replace(/^USER#/, "");
        foundByCand.set(rawEntityId.toLowerCase().trim(), item);
        if (item.userId) foundByCand.set(String(item.userId).toLowerCase().trim(), item);
        if (item.email) {
          foundByCand.set(String(item.email).toLowerCase().trim(), item);
          foundByCand.set(String(item.email).replace(/[@.]/g, "_").toLowerCase().trim(), item);
        }
      }
    } catch (dynErr) {
      console.warn("[resolveUserProfiles] DynamoDB batch get notice:", dynErr);
    }
  }

  // 2. Fallback to Firestore for missing candidates
  const missingUids: string[] = [];
  for (const uid of unique) {
    const cands = uidToCandidates.get(uid) || [uid];
    const item = cands.map(c => foundByCand.get(c.toLowerCase().trim())).find(Boolean);
    if (!item) {
      missingUids.push(uid);
    }
  }

  if (missingUids.length > 0) {
    try {
      const missingKeys = missingUids.flatMap(uid => uidToCandidates.get(uid) || [uid]);
      const missingDocSnaps = await Promise.all(
        missingKeys.slice(0, 50).map(key => db.collection(getFirestoreCollection("users")).doc(key).get().catch(() => null))
      );
      for (let idx = 0; idx < missingDocSnaps.length; idx++) {
        const snap = missingDocSnaps[idx];
        if (snap && snap.exists) {
          const d = snap.data() || {};
          const key = missingKeys[idx].toLowerCase().trim();
          foundByCand.set(key, { ...d, id: snap.id });
        }
      }
    } catch (fsErr) {
      console.warn("[resolveUserProfiles] Firestore fallback notice:", fsErr);
    }
  }

  // 3. Assemble profileMap
  for (const uid of unique) {
    const cands = uidToCandidates.get(uid) || [uid];
    const item = cands.map(c => foundByCand.get(c.toLowerCase().trim())).find(Boolean);

    let cleanName = formatCleanUsername(uid);
    let avatarUrl: string | undefined = undefined;
    let badge = "Fan";

    if (item) {
      const rawUsername = item.username || item.name || `${item.firstName || ""} ${item.lastName || ""}`.trim();
      if (rawUsername) {
        cleanName = formatCleanUsername(rawUsername);
      }
      avatarUrl = item.avatarUrl || item.avatar || item.profilePicture || item.image || undefined;
      badge = item.badge || item.userBadge || "Fan";
    }

    profileMap.set(uid, {
      userId: uid,
      username: cleanName,
      avatarUrl,
      badge,
    });
  }

  return profileMap;
}
