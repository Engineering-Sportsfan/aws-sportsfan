// backend/scripts/test_flipline_notifications.ts — FlipLINE Comprehensive Notification Test Suite
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// In-Memory DynamoDB Mock Store to ensure complete test execution across all environments
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
      const pkValue = input.ExpressionAttributeValues?.[":pk"];
      const prefix =
        input.ExpressionAttributeValues?.[":skpfx"] ||
        input.ExpressionAttributeValues?.[":prefix"] ||
        "";
      const gsi2pk = input.ExpressionAttributeValues?.[":g"];

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

      matching.sort(
        (a, b) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime()
      );
      if (input.Select === "COUNT") {
        return { Count: matching.length, Items: [] };
      }
      return { Items: matching, Count: matching.length };
    }

    if (cmdName === "UpdateCommand") {
      const key = this.keyOf(input.Key.PK, input.Key.SK);
      const existing = this.items.get(key) || { PK: input.Key.PK, SK: input.Key.SK };
      const values = input.ExpressionAttributeValues || {};

      const updated = { ...existing };
      if (values[":body"]) updated.body = values[":body"];
      if (values[":cnt"]) updated.aggregation_count = values[":cnt"];
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

async function runFlipLineNotificationTestSuite() {
  console.log("==================================================================");
  console.log("⚡ FLIPLINE NOTIFICATION SYSTEM COMPREHENSIVE TEST SUITE");
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
  const originalSend = docClient.send;
  (docClient as any).send = (cmd: any) => mockDb.send(cmd);

  const {
    dispatchFlipLineNotification,
    extractMentions,
    resolveUserIdsFromHandles,
  } = await import("../lib/fliplineNotifications");

  const authorId = "u_author_rohit";
  const fanAlice = "u_fan_alice";
  const fanBob = "u_fan_bob";
  const fanCharlie = "u_fan_charlie";
  const cardId = "card_1727500000";
  const cardContent = "Rohit Sharma's cover drive today was pure perfection!";

  try {
    // ─── TEST 1: Post Liked Notification Creation & Pure DynamoDB Schema ────────
    console.log("--- TEST 1: Post Liked Notification Creation & Pure DynamoDB Schema ---");
    const notifId1 = await dispatchFlipLineNotification({
      type: "flipline.post_liked",
      actorId: fanAlice,
      actorName: "Alice Sharma",
      actorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=alice",
      recipientId: authorId,
      cardId,
      cardContent,
    });

    assert(Boolean(notifId1), "Initial like notification successfully generated notifId");

    const allItems = mockDb.getItems();
    const item1 = allItems.find((i) => i.PK === `USER#${authorId}`);

    assert(Boolean(item1), "Record persisted in DynamoDB table layout");
    assert(item1.entity_type === "NOTIFICATION", "entity_type === 'NOTIFICATION'");
    assert(item1.notification_type === "flipline.post_liked", "notification_type === 'flipline.post_liked'");
    assert(item1.entity_id === cardId, `entity_id matches '${cardId}'`);
    assert(item1.actor_id === fanAlice, `actor_id matches '${fanAlice}'`);
    assert(item1.actor_name === "Alice Sharma", "actor_name matches 'Alice Sharma'");
    assert(item1.aggregation_count === 1, "Initial aggregation_count === 1");
    assert(Array.isArray(item1.actor_names) && item1.actor_names[0] === "Alice Sharma", "actor_names array contains ['Alice Sharma']");
    assert(item1.aggregation_key === `AGGR#flipline.post_liked#${cardId}`, `aggregation_key is 'AGGR#flipline.post_liked#${cardId}'`);
    assert(item1.title === "FlipLINE", "title === 'FlipLINE'");
    assert(item1.body === "Alice Sharma liked your FlipLINE post", `body correctly formatted: "${item1.body}"`);
    assert(item1.cta_label === "View Post", "cta_label === 'View Post'");
    assert(item1.cta_target === `/MainModules/FlipLine?cardId=${encodeURIComponent(cardId)}`, "cta_target deep-links to post in FlipLine");
    assert(item1.priority === "NORMAL", "priority === 'NORMAL'");
    assert(item1.read === false, "read === false");
    assert(item1.GSI1PK === "TYPE#flipline.post_liked", "GSI1PK === 'TYPE#flipline.post_liked'");
    assert(item1.GSI2PK === `USER#${authorId}#UNREAD`, `GSI2PK === 'USER#${authorId}#UNREAD'`);

    // ─── TEST 2: 24-Hour Aggregation on Multiple Post Likes ────────────────────
    console.log("\n--- TEST 2: 24-Hour Aggregation on Multiple Post Likes ---");
    // Bob likes
    await dispatchFlipLineNotification({
      type: "flipline.post_liked",
      actorId: fanBob,
      actorName: "Bob Singh",
      recipientId: authorId,
      cardId,
      cardContent,
    });

    // Charlie likes
    await dispatchFlipLineNotification({
      type: "flipline.post_liked",
      actorId: fanCharlie,
      actorName: "Charlie Patel",
      recipientId: authorId,
      cardId,
      cardContent,
    });

    const itemsAfterLikes = mockDb
      .getItems()
      .filter((i) => i.PK === `USER#${authorId}` && i.notification_type === "flipline.post_liked");
    assert(itemsAfterLikes.length === 1, "Only 1 notification row exists for this aggregation key (Anti-Spam Aggregation)");

    const aggregated = itemsAfterLikes[0];
    assert(aggregated.aggregation_count === 3, `aggregation_count incremented to 3 (actual: ${aggregated.aggregation_count})`);
    assert(aggregated.actor_names.length === 3, `actor_names array contains 3 distinct actors: [${aggregated.actor_names.join(", ")}]`);
    assert(aggregated.body === "Charlie Patel and 2 others liked your post", `Aggregated message: "${aggregated.body}"`);

    // ─── TEST 3: Comment Added Notification with Snippet & Deep Link ───────────
    console.log("\n--- TEST 3: Comment Added Notification with Snippet & Deep Link ---");
    const commentId = "c_101_great_shot";
    const commentSnippet = "What an unbelievable stroke through extra cover!";

    await dispatchFlipLineNotification({
      type: "flipline.comment_added",
      actorId: fanBob,
      actorName: "Bob Singh",
      recipientId: authorId,
      cardId,
      cardContent,
      commentId,
      commentSnippet,
    });

    const commentNotif = mockDb
      .getItems()
      .find((i) => i.PK === `USER#${authorId}` && i.notification_type === "flipline.comment_added");
    assert(Boolean(commentNotif), "Comment notification exists for post author");
    assert(commentNotif?.body === `Bob Singh commented: "${commentSnippet}"`, `Comment body formatted: "${commentNotif?.body}"`);
    assert(
      commentNotif?.cta_target === `/MainModules/FlipLine?cardId=${encodeURIComponent(cardId)}&commentId=${encodeURIComponent(commentId)}`,
      "CTA target deep-links to commentId"
    );
    assert(commentNotif?.cta_label === "View Comment", "CTA label === 'View Comment'");

    // ─── TEST 4: Reply Added Notification with Snippet & Deep Link ─────────────
    console.log("\n--- TEST 4: Reply Added Notification with Snippet & Deep Link ---");
    const replyId = "r_201_agree";
    const replySnippet = "Totally agree, his footwork was immaculate.";

    await dispatchFlipLineNotification({
      type: "flipline.reply_added",
      actorId: fanCharlie,
      actorName: "Charlie Patel",
      recipientId: fanBob, // Charlie replies to Bob's comment
      cardId,
      cardContent,
      commentId,
      commentSnippet,
      replyId,
      replySnippet,
    });

    const replyNotif = mockDb
      .getItems()
      .find((i) => i.PK === `USER#${fanBob}` && i.notification_type === "flipline.reply_added");
    assert(Boolean(replyNotif), "Reply notification exists for comment author");
    assert(replyNotif?.body === `Charlie Patel replied to your comment: "${replySnippet}"`, `Reply body: "${replyNotif?.body}"`);
    assert(
      replyNotif?.cta_target ===
        `/MainModules/FlipLine?cardId=${encodeURIComponent(cardId)}&commentId=${encodeURIComponent(commentId)}&replyId=${encodeURIComponent(replyId)}`,
      "CTA target deep-links to commentId & replyId"
    );
    assert(replyNotif?.cta_label === "View Reply", "CTA label === 'View Reply'");

    // ─── TEST 5: Comment Liked Notification with 24h Aggregation ───────────────
    console.log("\n--- TEST 5: Comment Liked Notification with 24h Aggregation ---");
    await dispatchFlipLineNotification({
      type: "flipline.comment_liked",
      actorId: fanAlice,
      actorName: "Alice Sharma",
      recipientId: fanBob,
      cardId,
      commentId,
      commentSnippet,
    });

    await dispatchFlipLineNotification({
      type: "flipline.comment_liked",
      actorId: fanCharlie,
      actorName: "Charlie Patel",
      recipientId: fanBob,
      cardId,
      commentId,
      commentSnippet,
    });

    const commentLikes = mockDb
      .getItems()
      .filter((i) => i.PK === `USER#${fanBob}` && i.notification_type === "flipline.comment_liked");
    assert(commentLikes.length === 1, "Only 1 aggregated notification for comment likes");
    assert(commentLikes[0]?.aggregation_count === 2, "Comment likes aggregation count === 2");
    assert(commentLikes[0]?.body === "Charlie Patel and 1 other liked your comment", `Aggregated comment like text: "${commentLikes[0]?.body}"`);

    // ─── TEST 6: Mention Extraction & Dispatch ────────────────────────────────
    console.log("\n--- TEST 6: Mention Extraction & Dispatch ---");
    const mentionText = "Hey @virat and @hardik_pandya check out this awesome clip by @rohit!";
    const extracted = extractMentions(mentionText);
    assert(extracted.length === 3, `Extracted 3 handles: [${extracted.join(", ")}]`);
    assert(extracted.includes("virat") && extracted.includes("hardik_pandya") && extracted.includes("rohit"), "Extracted handles match expected");

    const resolved = await resolveUserIdsFromHandles(extracted);
    assert(resolved.size === 3, "Resolved map has 3 users");

    // Dispatch mention notification
    await dispatchFlipLineNotification({
      type: "flipline.user_mentioned",
      actorId: fanAlice,
      actorName: "Alice Sharma",
      recipientId: "u_virat_18",
      cardId,
      cardContent: mentionText,
      commentId,
      commentSnippet: mentionText,
    });

    const mentionNotif = mockDb
      .getItems()
      .find((i) => i.PK === "USER#u_virat_18" && i.notification_type === "flipline.user_mentioned");
    assert(Boolean(mentionNotif), "Mention notification delivered to mentioned user");
    assert(mentionNotif?.body?.includes("mentioned you in a comment"), `Mention body: "${mentionNotif?.body}"`);

    // ─── TEST 7: Milestone Notification on Trending Post ───────────────────────
    console.log("\n--- TEST 7: Milestone Notification on Trending Post ---");
    await dispatchFlipLineNotification({
      type: "flipline.milestone",
      actorId: "system",
      actorName: "SportsFan360",
      recipientId: authorId,
      cardId,
      milestoneLikes: 100,
      priority: "HIGH",
      allowSelf: true,
    });

    const milestoneNotif = mockDb
      .getItems()
      .find((i) => i.PK === `USER#${authorId}` && i.notification_type === "flipline.milestone");
    assert(Boolean(milestoneNotif), "Milestone notification delivered to author");
    assert(milestoneNotif?.priority === "HIGH", "Milestone notification priority === 'HIGH'");
    assert(milestoneNotif?.body?.includes("trending with over 100 likes"), `Milestone text: "${milestoneNotif?.body}"`);

    // ─── TEST 8: Self-Notification Drop (Suppression) ──────────────────────────
    console.log("\n--- TEST 8: Self-Notification Drop (Suppression) ---");
    const selfLike = await dispatchFlipLineNotification({
      type: "flipline.post_liked",
      actorId: authorId,
      actorName: "Rohit Author",
      recipientId: authorId,
      cardId,
      cardContent,
    });
    assert(selfLike === null, "Self like is dropped and returns null");

    // ─── TEST 9: Sparse GSI2 Unread Query & Read Status Update ────────────────
    console.log("\n--- TEST 9: Sparse GSI2 Unread Query & Read Status Update ---");
    const authorNotifs = mockDb.getItems().filter((i) => i.PK === `USER#${authorId}`);
    const unreadAuthor = authorNotifs.filter((i) => i.read === false);
    assert(unreadAuthor.length === 3, `Author has 3 unread notifications (actual: ${unreadAuthor.length})`);

    // Mark 1 as read
    const target = unreadAuthor[0];
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

    const updated = mockDb.getItems().find((i) => i.PK === target.PK && i.SK === target.SK);
    assert(updated?.read === true, "Notification read marked as true");
    assert(updated?.GSI2PK === undefined, "Sparse unread GSI2PK successfully removed on read");

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

runFlipLineNotificationTestSuite();
