import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { NextRequest } from "next/server";
import { GET, POST, PATCH } from "../app/api/flipline/route";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 STARTING FLIPLINE API COMPREHENSIVE TEST SUITE");
  console.log("==================================================\n");

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

  try {
    // TEST 1: GET all posts
    console.log("\n--- TEST 1: Fetching all FlipLine posts ---");
    const getReqAll = new NextRequest("http://localhost:3001/api/flipline");
    const getResAll = await GET(getReqAll);
    const getJsonAll = await getResAll.json();
    assert(getJsonAll.success === true, "GET /api/flipline returns success: true");
    assert(Array.isArray(getJsonAll.data), "GET /api/flipline returns data array");
    console.log(`Total posts retrieved: ${getJsonAll.data.length}`);
    const allCards = getJsonAll.data;
    assert(allCards.length > 0, "FlipLine has cards");
    const firstCard = allCards[0];
    assert(Array.isArray(firstCard.comments), "Card contains comments array");

    // TEST 2: GET filtered by cricket channel
    console.log("\n--- TEST 2: Filter by 'cricket' channel ---");
    const getReqCricket = new NextRequest("http://localhost:3001/api/flipline?channel=cricket");
    const getResCricket = await GET(getReqCricket);
    const getJsonCricket = await getResCricket.json();
    assert(getJsonCricket.success === true, "GET ?channel=cricket returns success: true");
    const cricketOnly = getJsonCricket.data.every(
      (c: any) => (c.channel || c.sport || "").toLowerCase() === "cricket"
    );
    assert(cricketOnly, "All returned posts in cricket channel are cricket posts");
    console.log(`Cricket channel posts count: ${getJsonCricket.data.length}`);

    // TEST 3: GET filtered by football channel
    console.log("\n--- TEST 3: Filter by 'football' channel ---");
    const getReqFootball = new NextRequest("http://localhost:3001/api/flipline?channel=football");
    const getResFootball = await GET(getReqFootball);
    const getJsonFootball = await getResFootball.json();
    assert(getJsonFootball.success === true, "GET ?channel=football returns success: true");
    const footballOnly = getJsonFootball.data.every(
      (c: any) => (c.channel || c.sport || "").toLowerCase() === "football"
    );
    assert(footballOnly, "All returned posts in football channel are football posts");
    console.log(`Football channel posts count: ${getJsonFootball.data.length}`);

    // TEST 4: GET filtered by general channel
    console.log("\n--- TEST 4: Filter by 'general' channel ---");
    const getReqGeneral = new NextRequest("http://localhost:3001/api/flipline?channel=general");
    const getResGeneral = await GET(getReqGeneral);
    const getJsonGeneral = await getResGeneral.json();
    assert(getJsonGeneral.success === true, "GET ?channel=general returns success: true");
    const generalOnly = getJsonGeneral.data.every(
      (c: any) => (c.channel || c.sport || "").toLowerCase() === "general"
    );
    assert(generalOnly, "All returned posts in general channel are general posts (no sports relation)");
    console.log(`General channel posts count: ${getJsonGeneral.data.length}`);

    // TEST 5: Create a new post in General channel
    console.log("\n--- TEST 5: Create a post in General channel ---");
    const postReqGeneral = new NextRequest("http://localhost:3001/api/flipline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Excited for the upcoming weekend discussions! #General #FanMeetup",
        channel: "general",
        author: "Alex_General",
        handle: "@alex_general",
        userId: "user_test_gen",
      }),
    });
    const postResGen = await POST(postReqGeneral);
    const postJsonGen = await postResGen.json();
    assert(postJsonGen.success === true, "POST general post returns success: true");
    assert(postJsonGen.data.sport === "general", "General post sport is 'general'");
    assert(postJsonGen.data.channel === "general", "General post channel is 'general'");
    assert(postJsonGen.data.scoreChip === undefined, "General post has no scoreChip (no sports relation)");
    assert(Array.isArray(postJsonGen.data.comments), "New post has initialized empty comments array");
    const testGenCardSk = postJsonGen.data.sk;

    // TEST 6: Create a new post in Cricket channel
    console.log("\n--- TEST 6: Create a post in Cricket channel ---");
    const postReqCricket = new NextRequest("http://localhost:3001/api/flipline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "What a spell by Bumrah! Truly world class. #Cricket #Bumrah",
        channel: "cricket",
        author: "CricketTester",
        handle: "@crickettester",
        userId: "user_test_cric",
      }),
    });
    const postResCric = await POST(postReqCricket);
    const postJsonCric = await postResCric.json();
    assert(postJsonCric.success === true, "POST cricket post returns success: true");
    assert(postJsonCric.data.channel === "cricket", "Cricket post channel is 'cricket'");
    const testCardSk = postJsonCric.data.sk;

    // TEST 7: Add a comment to the post
    console.log("\n--- TEST 7: Add comment to post ---");
    const commentReq = new NextRequest("http://localhost:3001/api/flipline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sk: testCardSk,
        action: "add_comment",
        userId: "user_commenter_1",
        userName: "Rahul Sharma",
        userHandle: "@rahul_s",
        content: "Incredible swing and seam movement today!",
      }),
    });
    const commentRes = await PATCH(commentReq);
    const commentJson = await commentRes.json();
    assert(commentJson.success === true, "PATCH add_comment returns success: true");
    assert(commentJson.comment.content === "Incredible swing and seam movement today!", "Comment content matches");
    assert(commentJson.comment.likes === 0, "Comment initial likes is 0");
    assert(Array.isArray(commentJson.comment.replies), "Comment has empty replies array");
    const commentId = commentJson.comment.id;

    // TEST 8: Like the comment
    console.log("\n--- TEST 8: Like the comment ---");
    const likeCommentReq = new NextRequest("http://localhost:3001/api/flipline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sk: testCardSk,
        action: "like_comment",
        commentId: commentId,
        userId: "user_liker_1",
      }),
    });
    const likeCommentRes = await PATCH(likeCommentReq);
    const likeCommentJson = await likeCommentRes.json();
    assert(likeCommentJson.success === true, "PATCH like_comment returns success: true");
    assert(likeCommentJson.comment.likes === 1, "Comment likes incremented to 1");
    assert(likeCommentJson.comment.likedBy.includes("user_liker_1"), "Comment likedBy contains user_liker_1");

    // TEST 9: Add a reply to the comment
    console.log("\n--- TEST 9: Add a reply to the comment ---");
    const replyReq = new NextRequest("http://localhost:3001/api/flipline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sk: testCardSk,
        action: "add_reply",
        commentId: commentId,
        userId: "user_replier_1",
        userName: "Sneha Patel",
        userHandle: "@sneha_p",
        content: "Agreed! Even the pitch conditions helped.",
        replyTo: "@rahul_s",
      }),
    });
    const replyRes = await PATCH(replyReq);
    const replyJson = await replyRes.json();
    assert(replyJson.success === true, "PATCH add_reply returns success: true");
    assert(replyJson.reply.content === "Agreed! Even the pitch conditions helped.", "Reply content matches");
    assert(replyJson.reply.replyTo === "@rahul_s", "Reply replyTo matches target author");
    assert(replyJson.reply.likes === 0, "Reply initial likes is 0");
    const replyId = replyJson.reply.id;

    // TEST 10: Like the reply
    console.log("\n--- TEST 10: Like the reply ---");
    const likeReplyReq = new NextRequest("http://localhost:3001/api/flipline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sk: testCardSk,
        action: "like_reply",
        commentId: commentId,
        replyId: replyId,
        userId: "user_liker_2",
      }),
    });
    const likeReplyRes = await PATCH(likeReplyReq);
    const likeReplyJson = await likeReplyRes.json();
    assert(likeReplyJson.success === true, "PATCH like_reply returns success: true");
    assert(likeReplyJson.reply.likes === 1, "Reply likes incremented to 1");
    assert(likeReplyJson.reply.likedBy.includes("user_liker_2"), "Reply likedBy contains user_liker_2");

    // TEST 11: Unlike the reply
    console.log("\n--- TEST 11: Unlike the reply ---");
    const unlikeReplyReq = new NextRequest("http://localhost:3001/api/flipline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sk: testCardSk,
        action: "unlike_reply",
        commentId: commentId,
        replyId: replyId,
        userId: "user_liker_2",
      }),
    });
    const unlikeReplyRes = await PATCH(unlikeReplyReq);
    const unlikeReplyJson = await unlikeReplyRes.json();
    assert(unlikeReplyJson.success === true, "PATCH unlike_reply returns success: true");
    assert(unlikeReplyJson.reply.likes === 0, "Reply likes decremented to 0");
    assert(!unlikeReplyJson.reply.likedBy.includes("user_liker_2"), "Reply likedBy no longer contains user_liker_2");

    console.log("\n==================================================");
    console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed with error:", error);
    process.exit(1);
  }
}

runTests();
