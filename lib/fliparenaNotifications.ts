// backend/lib/fliparenaNotifications.ts — 100% AWS DynamoDB FlipArena Notification Dispatcher
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { getCandidateTableNames } from "@/lib/dualWrite";
import { db } from "@/lib/firebaseAdmin";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const DEFAULT_TTL_DAYS = 30; // 30 days retention

export interface DispatchFlipArenaNotificationPayload {
  type:
    | "fliparena.post_liked"
    | "fliparena.post_voted"
    | "fliparena.prediction_won"
    | "fliparena.quiz_completed"
    | "fliparena.battle_challenged"
    | "fliparena.meme_reaction"
    | "fliparena.milestone"
    | string;
  actorId: string;
  actorName: string;
  actorAvatar?: string;
  recipientId: string;
  engagementId: string;
  engagementType: "quiz" | "poll" | "fan_battle" | "battle" | "prediction" | "meme" | string;
  engagementTitle?: string;
  bonusPoints?: number;
  reactionEmoji?: string;
  priority?: "HIGH" | "NORMAL" | "LOW";
}

function getTypeLabel(type: string): string {
  const clean = String(type || "").toLowerCase().trim();
  if (clean === "quiz") return "Quiz";
  if (clean === "poll") return "Poll";
  if (clean === "fan_battle" || clean === "battle") return "Fan Battle";
  if (clean === "prediction") return "Prediction";
  if (clean === "meme") return "Meme";
  return "Event";
}

function formatCtaTarget(engagementId: string, engagementType: string): string {
  const cleanType = String(engagementType || "").toLowerCase().trim();
  return `/MainModules/FlipArena?itemId=${encodeURIComponent(engagementId)}&type=${encodeURIComponent(cleanType)}`;
}

function formatNotificationBody(
  payload: DispatchFlipArenaNotificationPayload,
  count: number = 1,
  actorNames: string[] = []
): string {
  const typeLabel = getTypeLabel(payload.engagementType);
  const titleSnippet = payload.engagementTitle
    ? ` "${payload.engagementTitle.length > 50 ? payload.engagementTitle.slice(0, 47) + '...' : payload.engagementTitle}"`
    : '';

  const cleanActor = String(payload.actorId || "").replace(/^USER#/, "").trim();
  const cleanRecipient = String(payload.recipientId || "").replace(/^USER#/, "").trim();
  const isSelf = cleanActor && cleanRecipient && cleanActor === cleanRecipient;
  const actorDisplay = isSelf ? "You" : payload.actorName;

  switch (payload.type) {
    case "fliparena.post_liked":
      if (count > 1) {
        return `${payload.actorName} and ${count - 1} other${count > 2 ? "s" : ""} liked your ${typeLabel}${titleSnippet}`;
      }
      return `${actorDisplay} liked your ${typeLabel}${titleSnippet}`;

    case "fliparena.post_voted":
      if (count > 1) {
        return `${payload.actorName} and ${count - 1} other${count > 2 ? "s" : ""} participated in your ${typeLabel}${titleSnippet}`;
      }
      return `${actorDisplay} participated in your ${typeLabel}${titleSnippet}`;

    case "fliparena.meme_reaction":
      const emoji = payload.reactionEmoji || "🔥";
      if (count > 1) {
        return `${payload.actorName} and ${count - 1} others reacted ${emoji} to your Meme`;
      }
      return `${actorDisplay} reacted ${emoji} to your Meme`;

    case "fliparena.prediction_won":
      return `🎉 Correct Answer! You won +${payload.bonusPoints || 10} SXPs Bonus on ${typeLabel}${titleSnippet}`;

    case "fliparena.quiz_completed":
      return `🧠 Quiz Completed! You earned points on ${typeLabel}${titleSnippet}`;

    case "fliparena.battle_challenged":
      return `⚔️ ${payload.actorName} challenged you in ${payload.engagementTitle || "a Fan Battle"}!`;

    case "fliparena.milestone":
      return `🔥 Your ${typeLabel}${titleSnippet} is trending with high fan engagement!`;

    default:
      return `${payload.actorName} interacted with your ${typeLabel}${titleSnippet}`;
  }
}

/**
 * Finds an unread aggregated notification within the last 24 hours across candidate tables.
 */
async function findUnreadAggregation(
  recipientId: string,
  aggregationKey: string,
  windowMs: number = 24 * 60 * 60 * 1000
): Promise<{ item: any; table: string } | null> {
  const candidateTables = getCandidateTableNames(TABLES.Notifications);
  const cleanRecipientId = recipientId.replace(/^USER#/, "").trim();

  for (const table of candidateTables) {
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :skpfx)",
          ExpressionAttributeValues: {
            ":pk": `USER#${cleanRecipientId}`,
            ":skpfx": "NOTIF#",
          },
          ScanIndexForward: false,
          Limit: 20,
        })
      );

      if (!res.Items || res.Items.length === 0) continue;

      const cutoff = Date.now() - windowMs;
      for (const item of res.Items) {
        if (item.read === true) continue;
        if (item.aggregation_key === aggregationKey) {
          const itemTime = new Date(item.sent_at || 0).getTime();
          if (itemTime >= cutoff) {
            return { item, table };
          }
        }
      }
    } catch (err: any) {
      const isTableMissing =
        err?.name === "ResourceNotFoundException" ||
        err?.message?.includes("Cannot do operations on a non-existent table");
      if (!isTableMissing) {
        console.warn(`[findUnreadAggregation] Table notice (${table}):`, err?.message || err);
      }
    }
  }
  return null;
}

/**
 * Dispatches a FlipArena notification with automatic 24-hour aggregation in DynamoDB + Firestore.
 */
export async function dispatchFlipArenaNotification(
  payload: DispatchFlipArenaNotificationPayload & { allowSelf?: boolean }
): Promise<string | null> {
  if (!payload.recipientId) {
    return null;
  }

  const cleanRecipientId = String(payload.recipientId).replace(/^USER#/, "").trim();
  const cleanActorId = String(payload.actorId || "").replace(/^USER#/, "").trim();

  if (!cleanRecipientId) return null;

  // Self-notification suppression (standard unless explicitly allowed)
  if (cleanActorId && cleanActorId === cleanRecipientId && !payload.allowSelf) {
    return null;
  }

  const now = new Date();
  const sentAt = now.toISOString();
  const notifId = `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Math.floor(now.getTime() / 1000) + DEFAULT_TTL_DAYS * 86400;

  const isAggregatable =
    payload.type === "fliparena.post_liked" ||
    payload.type === "fliparena.post_voted" ||
    payload.type === "fliparena.meme_reaction";

  const aggregationKey = isAggregatable
    ? `AGGR#${payload.type}#${payload.engagementId}`
    : undefined;

  const typeLabel = getTypeLabel(payload.engagementType);

  // 1. Check for existing unread aggregation
  if (isAggregatable && aggregationKey) {
    const existingResult = await findUnreadAggregation(cleanRecipientId, aggregationKey);

    if (existingResult) {
      const { item: existing, table: matchedTable } = existingResult;
      const nextCount = (Number(existing.aggregation_count) || 1) + 1;
      const existingNames: string[] = Array.isArray(existing.actor_names)
        ? existing.actor_names
        : [existing.actor_name || "A fan"];

      const updatedNames = Array.from(new Set([payload.actorName, ...existingNames]));
      const newBody = formatNotificationBody(payload, nextCount, updatedNames);

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: matchedTable,
            Key: { PK: existing.PK, SK: existing.SK },
            UpdateExpression:
              "SET #body = :body, aggregation_count = :cnt, actor_id = :actId, actor_name = :actName, actor_avatar = :actAvatar, actor_names = :actNames, sent_at = :now, GSI2SK = :nowGsi",
            ExpressionAttributeNames: { "#body": "body" },
            ExpressionAttributeValues: {
              ":body": newBody,
              ":cnt": nextCount,
              ":actId": cleanActorId,
              ":actName": payload.actorName,
              ":actAvatar": payload.actorAvatar || existing.actor_avatar || null,
              ":actNames": updatedNames,
              ":now": sentAt,
              ":nowGsi": `SENTAT#${sentAt}#${(existing.SK as string)?.split("#").pop() || notifId}`,
            },
          })
        );

        // Sync update to Firestore
        if (db) {
          const docKey = `${(existing.SK as string)?.split("#").pop() || notifId}_${cleanRecipientId}`;
          await db
            .collection(getFirestoreCollection("notifications"))
            .doc(docKey)
            .set(
              {
                message: newBody,
                body: newBody,
                actor_names: updatedNames,
                aggregation_count: nextCount,
                updatedAt: Date.now(),
              },
              { merge: true }
            )
            .catch(() => {});
        }

        return (existing.SK as string)?.split("#").pop() || null;
      } catch (updateErr) {
        console.warn("[dispatchFlipArenaNotification] Aggregation update fallback notice:", updateErr);
      }
    }
  }

  // 2. Create fresh DynamoDB notification matching user's exact schema
  const title = "FlipARENA";
  const body = formatNotificationBody(payload, 1, [payload.actorName]);
  const ctaLabel = `View ${typeLabel}`;
  const ctaTarget = formatCtaTarget(payload.engagementId, payload.engagementType);

  const item: Record<string, any> = {
    PK: `USER#${cleanRecipientId}`,
    SK: `NOTIF#${sentAt}#${notifId}`,
    entity_type: "NOTIFICATION",
    notification_type: payload.type,
    entity_id: payload.engagementId,
    actor_id: cleanActorId,
    actor_name: payload.actorName,
    actor_avatar:
      payload.actorAvatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanActorId || "sportsfan"}`,
    actor_names: [payload.actorName],
    aggregation_count: 1,
    ...(aggregationKey ? { aggregation_key: aggregationKey } : {}),
    title,
    body,
    message: body,
    cta_label: ctaLabel,
    cta_target: ctaTarget,
    priority: payload.priority || (payload.type === "fliparena.prediction_won" ? "HIGH" : "NORMAL"),
    read: false,
    isRead: false,
    response_given: false,
    cta_clicked: false,
    sent_at: sentAt,
    createdAt: Date.now(),
    expires_at: expiresAt,
    GSI1PK: `TYPE#${payload.type}`,
    GSI1SK: `SENTAT#${sentAt}#${notifId}`,
    GSI2PK: `USER#${cleanRecipientId}#UNREAD`,
    GSI2SK: `SENTAT#${sentAt}#${notifId}`,
  };

  // 3. Write to candidate DynamoDB tables
  let writtenDynamo = false;
  const candidateTables = getCandidateTableNames(TABLES.Notifications);

  for (const table of candidateTables) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: table,
          Item: item,
        })
      );
      writtenDynamo = true;
      break;
    } catch (putErr: any) {
      const isTableMissing =
        putErr?.name === "ResourceNotFoundException" ||
        putErr?.message?.includes("Cannot do operations on a non-existent table");
      if (!isTableMissing) {
        console.warn(`[dispatchFlipArenaNotification] DynamoDB write notice (${table}):`, putErr?.message || putErr);
        break;
      }
    }
  }

  // 4. Sync to Firestore for bulletproof cross-subsystem fallback
  if (db) {
    try {
      const firestoreDocId = `${notifId}_${cleanRecipientId}`;
      await db
        .collection(getFirestoreCollection("notifications"))
        .doc(firestoreDocId)
        .set({
          id: notifId,
          recipientEmail: cleanRecipientId,
          recipientUid: cleanRecipientId,
          type: payload.type,
          notification_type: payload.type,
          title,
          body,
          message: body,
          cta_label: ctaLabel,
          ctaLabel,
          cta_target: ctaTarget,
          ctaTarget,
          actor_id: cleanActorId,
          actor_name: payload.actorName,
          actor_avatar: item.actor_avatar,
          actor_names: [payload.actorName],
          priority: item.priority,
          read: false,
          isRead: false,
          createdAt: Date.now(),
          sent_at: sentAt,
          category: "fliparena",
          feature_area: "fliparena",
        });
    } catch (fbErr) {
      console.warn("[dispatchFlipArenaNotification] Firestore sync notice:", fbErr);
    }
  }

  return writtenDynamo ? notifId : notifId;
}

export interface ContentDropPayload {
  engagementId: string;
  engagementType: "quiz" | "poll" | "fan_battle" | "battle" | "prediction" | "meme" | string;
  engagementTitle?: string;
  creatorId?: string;
  creatorName?: string;
  creatorAvatar?: string;
  recipientIds?: string[];
}

/**
 * Formats dynamic, anti-spam consolidated notification copy based on distinct dropped types
 */
export function formatContentDropMessage(types: string[]): { title: string; body: string; ctaLabel: string } {
  const uniqueTypes = Array.from(
    new Set(
      types.map((t) => {
        const c = t.toLowerCase().trim();
        if (c === "fan_battle" || c === "battle") return "battle";
        return c;
      })
    )
  );

  const hasQuiz = uniqueTypes.includes("quiz");
  const hasPoll = uniqueTypes.includes("poll");
  const hasMeme = uniqueTypes.includes("meme");
  const hasBattle = uniqueTypes.includes("battle");
  const hasPrediction = uniqueTypes.includes("prediction");

  const typeNames: string[] = [];
  if (hasQuiz) typeNames.push("Quiz");
  if (hasPoll) typeNames.push("Poll");
  if (hasBattle) typeNames.push("Fan Battle");
  if (hasPrediction) typeNames.push("Prediction");
  if (hasMeme) typeNames.push("Memes");

  let typePhrase = "New Challenges";
  let actionPhrase = "Tap to participate and earn bonus SXPs.";

  if (typeNames.length === 1) {
    const single = typeNames[0];
    if (single === "Quiz") {
      typePhrase = "New Quiz";
      actionPhrase = "Test your sports knowledge and earn bonus SXPs.";
    } else if (single === "Poll") {
      typePhrase = "New Poll";
      actionPhrase = "Vote now and earn bonus SXPs.";
    } else if (single === "Memes") {
      typePhrase = "New Memes";
      actionPhrase = "React to the latest drops and earn bonus SXPs.";
    } else if (single === "Fan Battle") {
      typePhrase = "New Fan Battle";
      actionPhrase = "Pick your side and earn bonus SXPs.";
    } else if (single === "Prediction") {
      typePhrase = "New Match Prediction";
      actionPhrase = "Predict outcomes and win bonus SXPs.";
    }
  } else if (typeNames.length === 2) {
    typePhrase = `New ${typeNames[0]} & ${typeNames[1]}`;
    if (hasQuiz && hasPoll) {
      actionPhrase = "Test your sports knowledge, vote & earn bonus SXPs.";
    } else if (hasQuiz && hasMeme) {
      actionPhrase = "Test your knowledge, react & earn bonus SXPs.";
    } else if (hasPoll && hasMeme) {
      actionPhrase = "Vote, react & earn bonus SXPs.";
    } else {
      actionPhrase = "Play now to earn bonus SXPs.";
    }
  } else {
    // 3 or more types (e.g. Quiz, Poll & Memes)
    const last = typeNames[typeNames.length - 1];
    const rest = typeNames.slice(0, -1).join(", ");
    typePhrase = `New ${rest} & ${last}`;
    if (hasQuiz) {
      actionPhrase = "Test your sports knowledge, vote & earn bonus SXPs.";
    } else {
      actionPhrase = "Tap to participate and earn bonus SXPs.";
    }
  }

  return {
    title: "FlipARENA",
    body: `${typePhrase} dropped in FlipArena! ${actionPhrase}`,
    ctaLabel: "Play & Earn",
  };
}

/**
 * Dispatches 60-Minute Aggregated Content Drop Notification to all users
 */
export async function dispatchFlipArenaContentDropNotification(
  payload: ContentDropPayload
): Promise<string[]> {
  const windowMs = 60 * 60 * 1000; // 60-Minute Aggregation Window
  const aggregationKey = "AGGR#fliparena.content_dropped";
  const now = new Date();
  const sentAt = now.toISOString();
  const expiresAt = Math.floor(now.getTime() / 1000) + DEFAULT_TTL_DAYS * 86400;

  // Resolve target recipients
  let targetRecipients: string[] = [];
  if (payload.recipientIds && payload.recipientIds.length > 0) {
    targetRecipients = payload.recipientIds;
  } else {
    try {
      if (db) {
        const usersSnap = await db.collection("users").limit(100).get();
        targetRecipients = usersSnap.docs.map((d) => d.id || d.data().userId || d.data().email).filter(Boolean);
      }
    } catch {
      // Fallback
    }
  }

  const cleanCreator = String(payload.creatorId || "").replace(/^USER#/, "").trim();
  const distinctRecipients = Array.from(new Set(targetRecipients))
    .map((r) => String(r).replace(/^USER#/, "").trim())
    .filter((r) => r && r !== cleanCreator);

  if (distinctRecipients.length === 0) {
    distinctRecipients.push("ALL_USERS");
  }

  const dispatchedIds: string[] = [];
  const candidateTables = getCandidateTableNames(TABLES.Notifications);

  for (const recipientId of distinctRecipients) {
    const existingResult = await findUnreadAggregation(recipientId, aggregationKey, windowMs);

    if (existingResult) {
      const { item: existing, table: matchedTable } = existingResult;
      const existingTypes: string[] = Array.isArray(existing.dropped_types)
        ? existing.dropped_types
        : [existing.engagement_type || payload.engagementType];

      const mergedTypes = Array.from(new Set([...existingTypes, payload.engagementType]));
      const nextDropCount = (Number(existing.dropped_count) || existingTypes.length) + 1;
      const formatted = formatContentDropMessage(mergedTypes);

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: matchedTable,
            Key: { PK: existing.PK, SK: existing.SK },
            UpdateExpression:
              "SET #body = :body, #msg = :body, dropped_types = :dTypes, dropped_count = :dCnt, aggregation_count = :dCnt, sent_at = :now, GSI2SK = :nowGsi",
            ExpressionAttributeNames: { "#body": "body", "#msg": "message" },
            ExpressionAttributeValues: {
              ":body": formatted.body,
              ":dTypes": mergedTypes,
              ":dCnt": nextDropCount,
              ":now": sentAt,
              ":nowGsi": `SENTAT#${sentAt}#${(existing.SK as string)?.split("#").pop() || "drop"}`,
            },
          })
        );

        if (db) {
          const docKey = `${(existing.SK as string)?.split("#").pop() || "drop"}_${recipientId}`;
          await db
            .collection(getFirestoreCollection("notifications"))
            .doc(docKey)
            .set(
              {
                message: formatted.body,
                body: formatted.body,
                dropped_types: mergedTypes,
                dropped_count: nextDropCount,
                updatedAt: Date.now(),
              },
              { merge: true }
            )
            .catch(() => {});
        }

        dispatchedIds.push((existing.SK as string)?.split("#").pop() || "updated");
        continue;
      } catch (updateErr) {
        console.warn("[dispatchFlipArenaContentDropNotification] Update notice:", updateErr);
      }
    }

    // Fresh Notification creation within the 60-min window
    const notifId = `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const formatted = formatContentDropMessage([payload.engagementType]);
    const ctaTarget = "/MainModules/FlipArena";

    const item: Record<string, any> = {
      PK: `USER#${recipientId}`,
      SK: `NOTIF#${sentAt}#${notifId}`,
      entity_type: "NOTIFICATION",
      notification_type: "fliparena.content_dropped",
      entity_id: payload.engagementId,
      actor_id: cleanCreator || "SYSTEM",
      actor_name: payload.creatorName || "FlipARENA",
      actor_avatar: payload.creatorAvatar || "https://api.dicebear.com/7.x/bottts/svg?seed=fliparena",
      actor_names: [payload.creatorName || "FlipARENA"],
      aggregation_key: aggregationKey,
      aggregation_count: 1,
      dropped_types: [payload.engagementType],
      dropped_count: 1,
      title: formatted.title,
      body: formatted.body,
      message: formatted.body,
      cta_label: formatted.ctaLabel,
      cta_target: ctaTarget,
      priority: "NORMAL",
      read: false,
      isRead: false,
      response_given: false,
      cta_clicked: false,
      sent_at: sentAt,
      createdAt: Date.now(),
      expires_at: expiresAt,
      category: "fliparena",
      feature_area: "fliparena",
      GSI1PK: "TYPE#fliparena.content_dropped",
      GSI1SK: `SENTAT#${sentAt}#${notifId}`,
      GSI2PK: `USER#${recipientId}#UNREAD`,
      GSI2SK: `SENTAT#${sentAt}#${notifId}`,
    };

    for (const table of candidateTables) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: table,
            Item: item,
          })
        );
        break;
      } catch (putErr: any) {
        const isTableMissing =
          putErr?.name === "ResourceNotFoundException" ||
          putErr?.message?.includes("Cannot do operations on a non-existent table");
        if (!isTableMissing) {
          console.warn(`[dispatchFlipArenaContentDropNotification] DynamoDB write notice (${table}):`, putErr?.message || putErr);
          break;
        }
      }
    }

    if (db) {
      try {
        const firestoreDocId = `${notifId}_${recipientId}`;
        await db
          .collection(getFirestoreCollection("notifications"))
          .doc(firestoreDocId)
          .set({
            id: notifId,
            recipientEmail: recipientId,
            recipientUid: recipientId,
            type: "fliparena.content_dropped",
            notification_type: "fliparena.content_dropped",
            title: formatted.title,
            body: formatted.body,
            message: formatted.body,
            cta_label: formatted.ctaLabel,
            ctaLabel: formatted.ctaLabel,
            cta_target: ctaTarget,
            ctaTarget,
            actor_id: cleanCreator || "SYSTEM",
            actor_name: payload.creatorName || "FlipARENA",
            actor_avatar: item.actor_avatar,
            priority: "NORMAL",
            read: false,
            isRead: false,
            dropped_types: [payload.engagementType],
            dropped_count: 1,
            createdAt: Date.now(),
            sent_at: sentAt,
            category: "fliparena",
            feature_area: "fliparena",
          });
      } catch (fbErr) {
        console.warn("[dispatchFlipArenaContentDropNotification] Firestore sync notice:", fbErr);
      }
    }

    dispatchedIds.push(notifId);
  }

  return dispatchedIds;
}


