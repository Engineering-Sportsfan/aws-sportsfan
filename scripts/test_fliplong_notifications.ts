// backend/scripts/test_fliplong_notifications.ts — FlipLONG Comprehensive Notification Test Suite
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

      const matching: any[] = [];
      for (const item of this.items.values()) {
        if (pkValue && item.PK === pkValue) {
          if (!prefix || item.SK.startsWith(prefix)) {
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
  console.log("🎬  FLIPLONG NOTIFICATIONS COMPREHENSIVE TEST SUITE           ");
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

  // Dynamic import after dotenv has been initialized
  const {
    notifyFlipLongVideoLiked,
    notifyFlipLongProcessingComplete,
    notifyFlipLongVideoPublished,
    dispatchFlipLongNotification,
  } = await import("../lib/notifications");

  try {
    // TEST 1: Video Liked Notification
    console.log("--- Test 1: notifyFlipLongVideoLiked ---");
    mockDb.clear();

    const notifId1 = await notifyFlipLongVideoLiked({
      videoId: "vid_123456",
      videoTitle: "Incredible Century Highlights",
      creatorId: "creator_kohli_18",
      creatorEmail: "virat@sportsfan.com",
      likerId: "fan_rahul_99",
      likerName: "Rahul Fan",
      likerAvatar: "https://example.com/avatar.jpg",
    });

    assert(Boolean(notifId1), "Returned a valid notification ID");

    const items1 = mockDb.getAllItems();
    assert(items1.length > 0, "Notification written to DynamoDB store");

    const notif1 = items1[0];
    assert(notif1.category === "fliplong", "Category is 'fliplong'");
    assert(notif1.notification_type === "fliplong.video_liked", "Notification type is 'fliplong.video_liked'");
    assert(notif1.PK === "USER#creator_kohli_18", "PK points to creator actualUserId");
    assert(notif1.body.includes("Rahul Fan liked your video"), "Body contains liker name and action");
    assert(notif1.cta_target === "/MainModules/FlipLong?videoId=vid_123456", "CTA target links directly to video");
    assert(notif1.actor?.username === "Rahul Fan", "Actor details preserved");

    // TEST 2: Self-Like Suppression Guard
    console.log("\n--- Test 2: Self-Like Suppression Guard ---");
    mockDb.clear();

    const selfNotifById = await notifyFlipLongVideoLiked({
      videoId: "vid_123456",
      videoTitle: "My Own Video",
      creatorId: "creator_kohli_18",
      creatorEmail: "virat@sportsfan.com",
      likerId: "creator_kohli_18", // same as creatorId
      likerName: "Virat Kohli",
    });

    assert(selfNotifById === null, "Self-like by creatorId correctly suppressed");
    assert(mockDb.getAllItems().length === 0, "No notification created on self-like");

    const selfNotifByEmail = await notifyFlipLongVideoLiked({
      videoId: "vid_123456",
      videoTitle: "My Own Video",
      creatorId: "creator_kohli_18",
      creatorEmail: "virat@sportsfan.com",
      likerId: "virat@sportsfan.com", // same as creatorEmail
      likerName: "Virat Kohli",
    });

    assert(selfNotifByEmail === null, "Self-like by email correctly suppressed");
    assert(mockDb.getAllItems().length === 0, "No notification created on email self-like");

    // TEST 3: notifyFlipLongProcessingComplete
    console.log("\n--- Test 3: notifyFlipLongProcessingComplete ---");
    mockDb.clear();

    const notifId3 = await notifyFlipLongProcessingComplete({
      videoId: "vid_ai_processed_777",
      videoTitle: "Match Winning Six",
      userId: "user_cricket_buff",
      userEmail: "buff@cricket.org",
      reelsCount: 4,
    });

    assert(Boolean(notifId3), "Returned a valid notification ID for AI processing complete");

    const items3 = mockDb.getAllItems();
    const notif3 = items3[0];
    assert(notif3.category === "fliplong", "Category is 'fliplong'");
    assert(notif3.notification_type === "fliplong.processing_complete", "Type is 'fliplong.processing_complete'");
    assert(notif3.priority === "HIGH", "Processing complete has HIGH priority");
    assert(notif3.body.includes("4 reels generated"), "Body includes generated reels count");
    assert(notif3.cta_label === "Review Video", "CTA label is 'Review Video'");

    // TEST 4: notifyFlipLongVideoPublished
    console.log("\n--- Test 4: notifyFlipLongVideoPublished ---");
    mockDb.clear();

    const notifId4 = await notifyFlipLongVideoPublished({
      videoId: "vid_drop_999",
      videoTitle: "Top 10 Catches of IPL 2026",
      authorName: "SportsFan Official",
      authorId: "admin_sf_01",
      sport: "cricket",
    });

    assert(Boolean(notifId4), "Returned valid notification ID for published video drop");

    const items4 = mockDb.getAllItems();
    const notif4 = items4[0];
    assert(notif4.PK === "USER#all_users", "Published drop defaults to USER#all_users");
    assert(notif4.category === "fliplong", "Category is 'fliplong'");
    assert(notif4.notification_type === "fliplong.video_published", "Type is 'fliplong.video_published'");
    assert(notif4.cta_target === "/MainModules/FlipLong?videoId=vid_drop_999", "CTA links directly to dropped video");

    // TEST 5: dispatchFlipLongNotification (Generic)
    console.log("\n--- Test 5: dispatchFlipLongNotification (Generic) ---");
    mockDb.clear();

    const notifId5 = await dispatchFlipLongNotification({
      userId: "user_viewer_42",
      notificationType: "video_scheduled",
      title: "Video Premiere Tomorrow",
      body: "The grand documentary premieres tomorrow at 6 PM.",
      videoId: "vid_doc_100",
      videoTitle: "Road to the Championship",
    });

    assert(Boolean(notifId5), "Generic dispatcher creates notification");

    const items5 = mockDb.getAllItems();
    const notif5 = items5[0];
    assert(notif5.notification_type === "fliplong.video_scheduled", "Auto-namespaces type with 'fliplong.' prefix");
    assert(notif5.category === "fliplong", "Category is 'fliplong'");
    assert(notif5.metadata?.videoId === "vid_doc_100", "Metadata contains videoId");

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
