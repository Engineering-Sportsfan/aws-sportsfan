// backend/scripts/test_fliparena_notifications.ts — FlipArena Comprehensive Notification Test Suite
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// In-Memory DynamoDB Mock Store to ensure complete test execution in all environments
class InMemoryDynamoDBStore {
  private items: Map<string, any> = new Map();

  private keyOf(pk: string, sk: string) {
    return `${pk}###${sk}`;
  }

  async send(command: any): Promise<any> {
    const cmdName = command.constructor.name;
    const input = command.input;

    if (cmdName === "PutCommand" || input.Item) {
      const item = input.Item;
      this.items.set(this.keyOf(item.PK, item.SK), { ...item });
      return { $metadata: { httpStatusCode: 200 } };
    }

    if (cmdName === "GetCommand") {
      const key = this.keyOf(input.Key.PK, input.Key.SK);
      const item = this.items.get(key);
      return { Item: item ? { ...item } : undefined };
    }

    if (cmdName === "QueryCommand") {
      const pkValue = input.ExpressionAttributeValues[":pk"];
      const prefix = input.ExpressionAttributeValues[":skpfx"] || input.ExpressionAttributeValues[":prefix"] || "";
      const gsi2pk = input.ExpressionAttributeValues[":g"];

      const matching: any[] = [];
      for (const item of this.items.values()) {
        if (pkValue && item.PK === pkValue) {
          if (!prefix || item.SK.startsWith(prefix)) {
            matching.push({ ...item });
          }
        } else if (gsi2pk && item.GSI2PK === gsi2pk) {
          matching.push({ ...item });
        }
      }

      matching.sort((a, b) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime());
      if (input.Select === "COUNT") {
        return { Count: matching.length, Items: [] };
      }
      return { Items: matching, Count: matching.length };
    }

    if (cmdName === "UpdateCommand") {
      const key = this.keyOf(input.Key.PK, input.Key.SK);
      const existing = this.items.get(key) || { PK: input.Key.PK, SK: input.Key.SK };
      const values = input.ExpressionAttributeValues || {};
      const names = input.ExpressionAttributeNames || {};

      const updated = { ...existing };
      if (values[":body"]) updated.body = values[":body"];
      if (values[":cnt"]) updated.aggregation_count = values[":cnt"];
      if (values[":dCnt"]) {
        updated.aggregation_count = values[":dCnt"];
        updated.dropped_count = values[":dCnt"];
      }
      if (values[":dTypes"]) updated.dropped_types = values[":dTypes"];
      if (values[":actId"]) updated.actor_id = values[":actId"];
      if (values[":actName"]) updated.actor_name = values[":actName"];
      if (values[":actAvatar"]) updated.actor_avatar = values[":actAvatar"];
      if (values[":actNames"]) updated.actor_names = values[":actNames"];
      if (values[":now"]) updated.sent_at = values[":now"];
      if (values[":nowGsi"]) updated.GSI2SK = values[":nowGsi"];
      if (values[":true"]) updated.read = true;

      // Handle REMOVE GSI2PK, GSI2SK
      if (input.UpdateExpression && input.UpdateExpression.includes("REMOVE GSI2PK, GSI2SK")) {
        delete updated.GSI2PK;
        delete updated.GSI2SK;
      }

      this.items.set(key, updated);
      return { Attributes: updated, $metadata: { httpStatusCode: 200 } };
    }

    if (cmdName === "DeleteCommand") {
      const key = this.keyOf(input.Key.PK, input.Key.SK);
      this.items.delete(key);
      return { $metadata: { httpStatusCode: 200 } };
    }

    return {};
  }

  getItems() {
    return Array.from(this.items.values());
  }

  clear() {
    this.items.clear();
  }
}

async function runFlipArenaNotificationTestSuite() {
  console.log("==================================================================");
  console.log("🏟️  FLIPARENA NOTIFICATION SYSTEM COMPREHENSIVE TEST SUITE");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const mockDb = new InMemoryDynamoDBStore();
  const { docClient } = await import("../lib/dynamodb");
  // Monkey-patch docClient.send to use mockDb for resilient standalone test assertions
  const originalSend = docClient.send;
  (docClient as any).send = (cmd: any) => mockDb.send(cmd);

  const { dispatchFlipArenaNotification } = await import("../lib/fliparenaNotifications");

  const authorId = "u_author_777";
  const fanA = "u_fan_alice";
  const fanB = "u_fan_bob";
  const fanC = "u_fan_charlie";
  const engagementId = "eng_quiz_ipl_2026";
  const engagementTitle = "IPL 2026 Final Trivia Challenge";

  try {
    // ─── TEST 1: Initial Like Notification Creation & DynamoDB Schema ──────────
    console.log("--- TEST 1: Initial Like Notification Creation & DynamoDB Schema ---");
    const notifId1 = await dispatchFlipArenaNotification({
      type: "fliparena.post_liked",
      actorId: fanA,
      actorName: "Alice Sharma",
      actorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=alice",
      recipientId: authorId,
      engagementId,
      engagementType: "quiz",
      engagementTitle,
    });

    assert(Boolean(notifId1), "Initial like notification successfully generated notifId");

    const allItems = mockDb.getItems();
    const item1 = allItems.find((i) => i.PK === `USER#${authorId}`);

    assert(Boolean(item1), "Record persisted in DynamoDB table layout");
    assert(item1.entity_type === "NOTIFICATION", "entity_type === 'NOTIFICATION'");
    assert(item1.notification_type === "fliparena.post_liked", "notification_type === 'fliparena.post_liked'");
    assert(item1.entity_id === engagementId, `entity_id matches '${engagementId}'`);
    assert(item1.actor_id === fanA, `actor_id matches '${fanA}'`);
    assert(item1.actor_name === "Alice Sharma", "actor_name matches 'Alice Sharma'");
    assert(item1.aggregation_count === 1, "Initial aggregation_count === 1");
    assert(Array.isArray(item1.actor_names) && item1.actor_names[0] === "Alice Sharma", "actor_names array contains ['Alice Sharma']");
    assert(item1.aggregation_key === `AGGR#fliparena.post_liked#${engagementId}`, `aggregation_key is 'AGGR#fliparena.post_liked#${engagementId}'`);
    assert(item1.title === "FlipARENA", "title === 'FlipARENA'");
    assert(item1.body === 'Alice Sharma liked your Quiz "IPL 2026 Final Trivia Challenge"', `body correctly formatted: "${item1.body}"`);
    assert(item1.cta_label === "View Quiz", "cta_label === 'View Quiz'");
    assert(item1.cta_target === `/MainModules/FlipArena?itemId=${encodeURIComponent(engagementId)}&type=quiz`, "cta_target deep-links to Quiz in FlipArena");
    assert(item1.priority === "NORMAL", "priority === 'NORMAL'");
    assert(item1.read === false, "read === false");
    assert(item1.GSI1PK === "TYPE#fliparena.post_liked", "GSI1PK === 'TYPE#fliparena.post_liked'");
    assert(item1.GSI2PK === `USER#${authorId}#UNREAD`, `GSI2PK === 'USER#${authorId}#UNREAD'`);

    // ─── TEST 2: 24-Hour Aggregation on Multiple Likes ─────────────────────────
    console.log("\n--- TEST 2: 24-Hour Aggregation on Multiple Likes ---");
    // Bob likes
    await dispatchFlipArenaNotification({
      type: "fliparena.post_liked",
      actorId: fanB,
      actorName: "Bob Singh",
      recipientId: authorId,
      engagementId,
      engagementType: "quiz",
      engagementTitle,
    });

    // Charlie likes
    await dispatchFlipArenaNotification({
      type: "fliparena.post_liked",
      actorId: fanC,
      actorName: "Charlie Patel",
      recipientId: authorId,
      engagementId,
      engagementType: "quiz",
      engagementTitle,
    });

    const itemsAfterLikes = mockDb.getItems().filter((i) => i.PK === `USER#${authorId}` && i.notification_type === "fliparena.post_liked");
    assert(itemsAfterLikes.length === 1, "Only 1 notification row exists for this aggregation key (Anti-Spam Aggregation)");

    const aggregated = itemsAfterLikes[0];
    assert(aggregated.aggregation_count === 3, `aggregation_count incremented to 3 (actual: ${aggregated.aggregation_count})`);
    assert(aggregated.actor_names.length === 3, `actor_names array contains 3 distinct actors: [${aggregated.actor_names.join(", ")}]`);
    assert(aggregated.body === 'Charlie Patel and 2 others liked your Quiz "IPL 2026 Final Trivia Challenge"', `Aggregated message: "${aggregated.body}"`);

    // ─── TEST 3: Self-Notification Drop (Suppression) ──────────────────────────
    console.log("\n--- TEST 3: Self-Notification Drop (Suppression) ---");
    const selfDropResult = await dispatchFlipArenaNotification({
      type: "fliparena.post_liked",
      actorId: authorId,
      actorName: "Author Self",
      recipientId: authorId,
      engagementId,
      engagementType: "quiz",
      engagementTitle,
    });

    assert(selfDropResult === null, "Self-notification returns null and is not written to DynamoDB");

    // ─── TEST 4: Fan Battle & Poll Participation Notifications ─────────────────
    console.log("\n--- TEST 4: Fan Battle & Poll Participation Notifications ---");
    await dispatchFlipArenaNotification({
      type: "fliparena.post_voted",
      actorId: fanA,
      actorName: "Alice Sharma",
      recipientId: authorId,
      engagementId: "eng_battle_ind_vs_pak",
      engagementType: "fan_battle",
      engagementTitle: "India vs Pakistan Epic Face-Off",
    });

    const battleNotif = mockDb.getItems().find((i) => i.entity_id === "eng_battle_ind_vs_pak");
    assert(Boolean(battleNotif), "Fan battle participation notification exists");
    assert(battleNotif?.body?.includes("participated in your Fan Battle"), `Body formatted correctly: "${battleNotif?.body}"`);
    assert(battleNotif?.cta_target?.includes("type=fan_battle"), "CTA target links to fan_battle");

    // ─── TEST 5: Meme Reaction Notification with Emoji ─────────────────────────
    console.log("\n--- TEST 5: Meme Reaction Notification with Emoji ---");
    await dispatchFlipArenaNotification({
      type: "fliparena.meme_reaction",
      actorId: fanB,
      actorName: "Bob Singh",
      recipientId: authorId,
      engagementId: "eng_meme_kohli_dance",
      engagementType: "meme",
      engagementTitle: "Virat celebration dance",
      reactionEmoji: "🔥",
    });

    const memeNotif = mockDb.getItems().find((i) => i.entity_id === "eng_meme_kohli_dance");
    assert(Boolean(memeNotif), "Meme reaction notification exists");
    assert(memeNotif?.body === "Bob Singh reacted 🔥 to your Meme", `Meme body contains emoji: "${memeNotif?.body}"`);
    assert(memeNotif?.cta_target?.includes("type=meme"), "Meme CTA target links to type=meme");

    // ─── TEST 6: Prediction Won / Accuracy Bonus Notification (+10 SXPs) ───────
    console.log("\n--- TEST 6: Prediction Won / Accuracy Bonus Notification ---");
    await dispatchFlipArenaNotification({
      type: "fliparena.prediction_won",
      actorId: "system",
      actorName: "SportsFan360",
      recipientId: fanA,
      engagementId: "eng_pred_match_winner",
      engagementType: "prediction",
      engagementTitle: "IND vs AUS Final",
      bonusPoints: 10,
      priority: "HIGH",
    });

    const winNotif = mockDb.getItems().find((i) => i.PK === `USER#${fanA}`);
    assert(Boolean(winNotif), "Winning notification delivered to fan A");
    assert(winNotif?.priority === "HIGH", "Winning notification priority === 'HIGH'");
    assert(winNotif?.body?.includes("+10 SXPs Bonus"), `Winning body includes points: "${winNotif?.body}"`);

    // ─── TEST 7: Notification Center Categorization & Read Status ──────────────
    console.log("\n--- TEST 7: Notification Center Categorization & Read Status ---");
    const authorNotifs = mockDb.getItems().filter((i) => i.PK === `USER#${authorId}`);
    assert(authorNotifs.length === 3, `Author has 3 distinct categorized notifications (found: ${authorNotifs.length})`);

    const unreadCount = authorNotifs.filter((i) => i.read === false).length;
    assert(unreadCount === 3, `Unread count === 3`);

    // Mark one notification as read
    const target = authorNotifs[0];
    const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
    await docClient.send(
      new UpdateCommand({
        TableName: "sf360-notifications",
        Key: { PK: target.PK, SK: target.SK },
        UpdateExpression: "SET #r = :true REMOVE GSI2PK, GSI2SK",
        ExpressionAttributeNames: { "#r": "read" },
        ExpressionAttributeValues: { ":true": true },
      })
    );

    const updatedTarget = mockDb.getItems().find((i) => i.PK === target.PK && i.SK === target.SK);
    assert(updatedTarget?.read === true, "Notification read status updated to true");
    assert(updatedTarget?.GSI2PK === undefined, "Sparse unread index GSI2PK successfully removed");

    // ─── TEST 8: 60-Minute Content Drop Notification Aggregation ───────────────
    console.log("\n--- TEST 8: 60-Minute Content Drop Notification Aggregation ---");
    const { dispatchFlipArenaContentDropNotification, formatContentDropMessage } = await import("../lib/fliparenaNotifications");

    // 8.1 Format message tests
    const msg1 = formatContentDropMessage(["quiz"]);
    assert(msg1.body === "New Quiz dropped in FlipArena! Test your sports knowledge and earn bonus SXPs.", `Msg 1 body: ${msg1.body}`);

    const msg2 = formatContentDropMessage(["quiz", "poll"]);
    assert(msg2.body === "New Quiz & Poll dropped in FlipArena! Test your sports knowledge, vote & earn bonus SXPs.", `Msg 2 body: ${msg2.body}`);

    const msg3 = formatContentDropMessage(["quiz", "poll", "meme"]);
    assert(msg3.body === "New Quiz, Poll & Memes dropped in FlipArena! Test your sports knowledge, vote & earn bonus SXPs.", `Msg 3 body: ${msg3.body}`);

    // 8.2 End-to-end 60-min window aggregation
    const testRecipient = "fan_target_123";
    await dispatchFlipArenaContentDropNotification({
      engagementId: "eng_quiz_drop_1",
      engagementType: "quiz",
      engagementTitle: "IPL Mega Quiz",
      recipientIds: [testRecipient],
    });

    const dropNotifs1 = mockDb.getItems().filter((i) => i.PK === `USER#${testRecipient}` && i.notification_type === "fliparena.content_dropped");
    assert(dropNotifs1.length === 1, `1 drop notification created initially (found: ${dropNotifs1.length})`);
    assert(dropNotifs1[0]?.body?.includes("New Quiz dropped"), `Body has Quiz: ${dropNotifs1[0]?.body}`);

    // Drop second item (poll) within 60 mins -> should collapse and update the same notification
    await dispatchFlipArenaContentDropNotification({
      engagementId: "eng_poll_drop_2",
      engagementType: "poll",
      engagementTitle: "Match Winner Poll",
      recipientIds: [testRecipient],
    });

    const dropNotifs2 = mockDb.getItems().filter((i) => i.PK === `USER#${testRecipient}` && i.notification_type === "fliparena.content_dropped");
    assert(dropNotifs2.length === 1, `Still only 1 consolidated notification after second drop (found: ${dropNotifs2.length})`);
    assert(dropNotifs2[0]?.body?.includes("New Quiz & Poll dropped"), `Updated body contains both Quiz & Poll: ${dropNotifs2[0]?.body}`);
    assert(dropNotifs2[0]?.aggregation_count === 2, `Aggregation count === 2`);

    // Drop third item (meme) within 60 mins -> collapses into Quiz, Poll & Memes
    await dispatchFlipArenaContentDropNotification({
      engagementId: "eng_meme_drop_3",
      engagementType: "meme",
      engagementTitle: "Funny Match Meme",
      recipientIds: [testRecipient],
    });

    const dropNotifs3 = mockDb.getItems().filter((i) => i.PK === `USER#${testRecipient}` && i.notification_type === "fliparena.content_dropped");
    assert(dropNotifs3.length === 1, `Still only 1 consolidated notification after 3 drops (found: ${dropNotifs3.length})`);
    assert(dropNotifs3[0]?.body?.includes("New Quiz, Poll & Memes dropped"), `Updated body contains Quiz, Poll & Memes: ${dropNotifs3[0]?.body}`);
    assert(dropNotifs3[0]?.aggregation_count === 3, `Aggregation count === 3`);

    console.log("\n==================================================================");
    console.log(`🎉 ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================");

    (docClient as any).send = originalSend;

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
}

runFlipArenaNotificationTestSuite();

