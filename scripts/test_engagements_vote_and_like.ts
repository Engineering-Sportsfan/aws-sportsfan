import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { NextRequest } from "next/server";
import { GET as getEngagements } from "../app/api/engagements/route";
import { POST as postVote, GET as getVoteStatus } from "../app/api/engagements/[id]/vote/route";
import { POST as postLike, GET as getLikeStatus } from "../app/api/engagements/[id]/like/route";
import { GET as getSingleEngagement } from "../app/api/engagements/[id]/route";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 STARTING ENGAGEMENTS VOTE & LIKE TEST SUITE");
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
    // 1. Fetch engagements list
    console.log("\n--- TEST 1: Fetch all engagements ---");
    const listReq = new NextRequest("http://localhost:3001/api/engagements");
    const listRes = await getEngagements(listReq);
    const listJson = await listRes.json();
    assert(listJson.success === true, "GET /api/engagements returns success: true");
    assert(Array.isArray(listJson.engagements), "Engagements list is an array");
    console.log(`Found ${listJson.engagements.length} engagements.`);

    const targetEngagement = listJson.engagements[0];
    if (!targetEngagement) {
      console.error("No engagement item found to test against.");
      process.exit(1);
    }
    const testEngId = targetEngagement.id;
    console.log(`Using target engagement ID: ${testEngId} (${targetEngagement.type})`);

    const testUserA = `test_user_${Date.now()}_a`;
    const testUserB = `test_user_${Date.now()}_b`;

    // 2. Test Like functionality (Matches api/roar pattern)
    console.log("\n--- TEST 2: Like engagement (Initial Like) ---");
    const likeReq1 = new NextRequest(`http://localhost:3001/api/engagements/${testEngId}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: testUserA }),
    });
    const likeRes1 = await postLike(likeReq1, { params: Promise.resolve({ id: testEngId }) });
    const likeJson1 = await likeRes1.json();
    assert(likeJson1.success === true, "POST like returns success: true");
    assert(likeJson1.liked === true, "Engagement is liked (liked: true)");
    const likesAfterFirst = likeJson1.likesCount;

    // 3. Check Like status via GET
    console.log("\n--- TEST 3: Check Like Status via GET ---");
    const checkLikeReq = new NextRequest(`http://localhost:3001/api/engagements/${testEngId}/like?userId=${testUserA}`);
    const checkLikeRes = await getLikeStatus(checkLikeReq, { params: Promise.resolve({ id: testEngId }) });
    const checkLikeJson = await checkLikeRes.json();
    assert(checkLikeJson.liked === true, "GET like status returns liked: true for user A");

    // 4. Unlike (Toggle like off)
    console.log("\n--- TEST 4: Unlike engagement (Toggle Off) ---");
    const unlikeReq = new NextRequest(`http://localhost:3001/api/engagements/${testEngId}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: testUserA }),
    });
    const unlikeRes = await postLike(unlikeReq, { params: Promise.resolve({ id: testEngId }) });
    const unlikeJson = await unlikeRes.json();
    assert(unlikeJson.success === true, "POST like toggle returns success: true");
    assert(unlikeJson.liked === false, "Engagement is now unliked (liked: false)");
    assert(unlikeJson.likesCount === likesAfterFirst - 1, "Likes count decremented by 1 on unlike");

    // 5. Test Voting: First Vote from User A
    console.log("\n--- TEST 5: Cast First Vote (User A) ---");
    const voteReqA1 = new NextRequest(`http://localhost:3001/api/engagements/${testEngId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedOptionId: "left",
        userId: testUserA,
      }),
    });
    const voteResA1 = await postVote(voteReqA1, { params: Promise.resolve({ id: testEngId }) });
    const voteJsonA1 = await voteResA1.json();
    assert(voteResA1.status === 200, "First vote HTTP status is 200 OK");
    assert(voteJsonA1.success === true, "First vote returns success: true");

    // 6. Test Single-Vote Restriction: Duplicate Vote Attempt by User A
    console.log("\n--- TEST 6: Duplicate Vote Attempt (User A voting twice) ---");
    const voteReqA2 = new NextRequest(`http://localhost:3001/api/engagements/${testEngId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedOptionId: "right",
        userId: testUserA,
      }),
    });
    const voteResA2 = await postVote(voteReqA2, { params: Promise.resolve({ id: testEngId }) });
    const voteJsonA2 = await voteResA2.json();
    assert(voteResA2.status === 400, "Duplicate vote HTTP status is 400 Bad Request");
    assert(voteJsonA2.alreadyVoted === true, "Duplicate vote returns alreadyVoted: true");
    assert(voteJsonA2.success === false, "Duplicate vote returns success: false");
    console.log("Duplicate vote error message received:", voteJsonA2.error);

    // 7. Check Vote Status via GET /api/engagements/[id]/vote
    console.log("\n--- TEST 7: Check Vote Status via GET ---");
    const getVoteReq = new NextRequest(`http://localhost:3001/api/engagements/${testEngId}/vote?userId=${testUserA}`);
    const getVoteRes = await getVoteStatus(getVoteReq, { params: Promise.resolve({ id: testEngId }) });
    const getVoteJson = await getVoteRes.json();
    assert(getVoteJson.hasVoted === true, "GET vote status returns hasVoted: true for User A");
    assert(getVoteJson.selectedOptionId === "left", "GET vote status returns original selectedOptionId: 'left'");

    // 8. Test Voting with a Different User (User B)
    console.log("\n--- TEST 8: Vote with Different User (User B) ---");
    const voteReqB = new NextRequest(`http://localhost:3001/api/engagements/${testEngId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedOptionId: "right",
        userId: testUserB,
      }),
    });
    const voteResB = await postVote(voteReqB, { params: Promise.resolve({ id: testEngId }) });
    const voteJsonB = await voteResB.json();
    assert(voteResB.status === 200, "User B first vote HTTP status is 200 OK");
    assert(voteJsonB.success === true, "User B first vote returns success: true");

    // 9. Test Single Engagement Hydration
    console.log("\n--- TEST 9: Hydration in GET /api/engagements/[id] ---");
    const singleReq = new NextRequest(`http://localhost:3001/api/engagements/${testEngId}?userId=${testUserA}`);
    const singleRes = await getSingleEngagement(singleReq, { params: Promise.resolve({ id: testEngId }) });
    const singleJson = await singleRes.json();
    assert(singleJson.success === true, "GET single engagement returns success: true");
    assert(singleJson.engagement.userVoted === true, "Single engagement correctly hydrates userVoted: true for User A");
    assert(singleJson.engagement.userVote === "left", "Single engagement correctly hydrates userVote: 'left' for User A");

    console.log("\n==================================================");
    console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
}

runTests();
