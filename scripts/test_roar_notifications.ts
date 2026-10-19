// backend/scripts/test_roar_notifications.ts — ROAR Comprehensive Notification Test Suite
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// In-Memory DynamoDB Mock Store
class InMemoryDynamoDBStore {
  private items: Map<string, any> = new Map();

  private keyOf(pk: string, sk: string) {
    return `${pk}###${sk}`;
  }

  async send(command: any): Promise<any> {
    const cmdName = command.constructor.name;
    const input = command.input;

    if (cmdName === "PutCommand" || input?.Item) {
      const item = input.Item;
      const pk = item.PK || item.roomId || item.contentId || item.entityId || "UNKNOWN";
      const sk = item.SK || item.sk || "DEFAULT";
      this.items.set(this.keyOf(pk, sk), { ...item });
      return { $metadata: { httpStatusCode: 200 } };
    }

    if (cmdName === "GetCommand") {
      const pk = input.Key.PK || input.Key.roomId || input.Key.contentId || input.Key.entityId;
      const sk = input.Key.SK || input.Key.sk;
      const key = this.keyOf(pk, sk);
      const item = this.items.get(key);
      return { Item: item ? { ...item } : undefined };
    }

    if (cmdName === "QueryCommand") {
      const pkValue =
        input.ExpressionAttributeValues?.[":pk"] ||
        input.ExpressionAttributeValues?.[":r"] ||
        input.ExpressionAttributeValues?.[":c"] ||
        input.ExpressionAttributeValues?.[":u"];
      const prefix =
        input.ExpressionAttributeValues?.[":prefix"] ||
        input.ExpressionAttributeValues?.[":p"] ||
        input.ExpressionAttributeValues?.[":mPrefix"] ||
        "";

      const matching: any[] = [];
      for (const item of this.items.values()) {
        const itemPk = item.PK || item.roomId || item.contentId;
        if (pkValue && itemPk === pkValue) {
          const itemSk = item.SK || item.sk || "";
          if (!prefix || itemSk.startsWith(prefix)) {
            matching.push({ ...item });
          }
        }
      }

      matching.sort((a, b) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime());
      return { Items: matching, Count: matching.length };
    }

    return { $metadata: { httpStatusCode: 200 } };
  }

  getAllItems(): any[] {
    return Array.from(this.items.values());
  }

  clear() {
    this.items.clear();
  }
}

async function runTests() {
  console.log("=============================================================");
  console.log("🦁  ROAR NOTIFICATIONS COMPREHENSIVE TEST SUITE              ");
  console.log("=============================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  const mockDb = new InMemoryDynamoDBStore();
  const { docClient } = await import("../lib/dynamodb");
  const originalSend = docClient.send;
  (docClient as any).send = (cmd: any) => mockDb.send(cmd);

  const {
    notifyPostReaction,
    notifyPostComment,
    notifyRoomMessageReaction,
    notifyRoomMessageComment,
    notifyMentions,
    notifyRoomGoingLive,
    notifyPredictionResolved,
    dispatchRoarNotification,
  } = await import("../lib/notifications");

  try {
    // ─── TEST 1: Feed Post Reaction Notification ───────────────────────────
    console.log("--- Test 1: notifyPostReaction (Feed Post) ---");
    mockDb.clear();

    const notifId1 = await notifyPostReaction(
      "post_cricket_99",
      "user_fan_sharma",
      "🔥",
      undefined, // feed post, no roomId
      "sharma@fan.com",
      {
        authorUid: "author_kohli_18",
        authorEmail: "virat@sportsfan.com",
        text: "India will win the 2026 World Cup without losing a match!",
        actorName: "Rohit Sharma",
      }
    );

    assert(Boolean(notifId1), "Returned a valid notification ID for feed post reaction");

    const items1 = mockDb.getAllItems().filter((i) => i.category === "roar");
    assert(items1.length > 0, "Notification written to DynamoDB store");

    const notif1 = items1[0];
    assert(notif1.category === "roar", "Category is 'roar'");
    assert(notif1.notification_type === "roar.post_reaction", "Type is 'roar.post_reaction'");
    assert(notif1.title.includes("Rohit Sharma reacted 🔥"), "Title contains actor name and emoji");
    assert(notif1.body.includes("India will win"), "Body contains post snippet");
    assert(notif1.cta_target === "/MainModules/ROAR", "CTA target routes to /MainModules/ROAR");
    assert(notif1.fan?.username === "Rohit Sharma", "Fan metadata preserved");

    // ─── TEST 2: Self-Reaction Suppression Guard ───────────────────────────
    console.log("\n--- Test 2: Self-Reaction Suppression Guard ---");
    mockDb.clear();

    const selfById = await notifyPostReaction(
      "post_cricket_99",
      "author_kohli_18",
      "❤️",
      undefined,
      "virat@sportsfan.com",
      {
        authorUid: "author_kohli_18",
        authorEmail: "virat@sportsfan.com",
        text: "Self post",
        actorName: "Virat Kohli",
      }
    );

    assert(selfById === null, "Self-reaction suppressed by authorUid");
    assert(mockDb.getAllItems().length === 0, "No notification created for self-reaction");

    const selfByEmail = await notifyPostReaction(
      "post_cricket_99",
      "other_id_but_same_email",
      "❤️",
      undefined,
      "virat@sportsfan.com",
      {
        authorUid: "author_kohli_18",
        authorEmail: "virat@sportsfan.com",
        text: "Self post",
        actorName: "Virat Kohli",
      }
    );

    assert(selfByEmail === null, "Self-reaction suppressed by authorEmail");
    assert(mockDb.getAllItems().length === 0, "No notification created for email self-reaction");

    // ─── TEST 3: Feed Post Comment / Reply Notification ────────────────────
    console.log("\n--- Test 3: notifyPostComment (Feed Post) ---");
    mockDb.clear();

    const notifId3 = await notifyPostComment(
      "post_cricket_99",
      "user_fan_sharma",
      "sharma@fan.com",
      "Rohit Sharma",
      "Totally agree with this bold prediction!",
      undefined,
      {
        authorUid: "author_kohli_18",
        authorEmail: "virat@sportsfan.com",
        text: "India will win the 2026 World Cup without losing a match!",
      }
    );

    assert(Boolean(notifId3), "Returned a valid notification ID for post comment");

    const items3 = mockDb.getAllItems().filter((i) => i.category === "roar");
    const notif3 = items3[0];
    assert(notif3.category === "roar", "Category is 'roar'");
    assert(notif3.notification_type === "roar.post_reply", "Type is 'roar.post_reply'");
    assert(notif3.title === "Rohit Sharma replied to your post", "Title formatted correctly");
    assert(notif3.body.includes("Totally agree"), "Body contains comment preview snippet");
    assert(notif3.cta_label === "View reply", "CTA label is 'View reply'");

    // ─── TEST 4: Self-Comment Suppression Guard ────────────────────────────
    console.log("\n--- Test 4: Self-Comment Suppression Guard ---");
    mockDb.clear();

    const selfComment = await notifyPostComment(
      "post_cricket_99",
      "author_kohli_18",
      "virat@sportsfan.com",
      "Virat Kohli",
      "My own reply to myself",
      undefined,
      {
        authorUid: "author_kohli_18",
        authorEmail: "virat@sportsfan.com",
      }
    );

    assert(selfComment === null, "Self-comment correctly suppressed");
    assert(mockDb.getAllItems().length === 0, "No notification generated on self-comment");

    // ─── TEST 5: Room Message Reaction & Comment Deep-linking ──────────────
    console.log("\n--- Test 5: Room Message Notification Deep-linking ---");
    mockDb.clear();

    const notifId5 = await notifyRoomMessageComment(
      "IND_vs_SL_Final",
      "msg_777",
      "user_fan_bumrah",
      "bumrah@fan.com",
      "Jasprit Bumrah",
      "What a yorker in the 19th over!",
      {
        authorUid: "author_kohli_18",
        authorEmail: "virat@sportsfan.com",
        text: "Match discussion live room",
      }
    );

    assert(Boolean(notifId5), "Returned valid notification ID for room reply");

    const items5 = mockDb.getAllItems().filter((i) => i.category === "roar");
    const notif5 = items5[0];
    assert(notif5.roomId === "IND_vs_SL_Final", "RoomId preserved on notification record");
    assert(notif5.cta_target.includes("/MainModules/ROAR?room=IND_vs_SL_Final"), "CTA target deep-links directly to room");

    // ─── TEST 6: Room Going Live Notification ──────────────────────────────
    console.log("\n--- Test 6: notifyRoomGoingLive ---");
    mockDb.clear();

    await notifyRoomGoingLive("IND_vs_AUS_Lobby", "IND vs AUS Mega Watchroom", [
      "user_fan_1",
      "user_fan_2",
    ]);

    const liveItems = mockDb.getAllItems().filter((i) => i.notification_type === "roar.room_live");
    assert(liveItems.length === 2, "Dispatched live alert to all specified followers");
    assert(liveItems[0].priority === "HIGH", "Room live alert has HIGH priority");
    assert(liveItems[0].title.includes("live now! 🔴"), "Title has live indicator");

    // ─── TEST 7: Prediction Resolution Notification ────────────────────────
    console.log("\n--- Test 7: notifyPredictionResolved ---");
    mockDb.clear();

    await notifyPredictionResolved(
      "user_predictor_42",
      "Kohli scores 80+ vs SL",
      "win",
      50,
      "post_pred_123"
    );

    const predItems = mockDb.getAllItems().filter((i) => i.category === "roar");
    assert(predItems.length > 0, "Prediction win notification created");
    assert(predItems[0].notification_type === "roar.prediction_ok", "Type is 'roar.prediction_ok'");
    assert(predItems[0].body.includes("+50 rep points"), "Body mentions rep points earned");

    // ─── TEST 8: Generic dispatchRoarNotification ──────────────────────────
    console.log("\n--- Test 8: dispatchRoarNotification (Generic) ---");
    mockDb.clear();

    const notifId8 = await dispatchRoarNotification({
      userId: "user_special_fan",
      notificationType: "badge_unlocked",
      title: "Badge Unlocked: Master Tactician 🏆",
      body: "You predicted 5 consecutive matches correctly!",
    });

    assert(Boolean(notifId8), "Generic ROAR dispatcher creates notification");

    const genericItems = mockDb.getAllItems().filter((i) => i.category === "roar");
    assert(genericItems[0].notification_type === "roar.badge_unlocked", "Auto-prefixes 'roar.' namespace");
    assert(genericItems[0].category === "roar", "Category is 'roar'");

    console.log("\n=============================================================");
    console.log(`🎉 TEST RUN COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log("=============================================================");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } finally {
    docClient.send = originalSend;
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
