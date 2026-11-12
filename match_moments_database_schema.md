# Sports Fan 360: Match Moments & Live Prediction Architecture
## Enterprise Scale & Production-Grade DynamoDB / Redis Specification

---

## 1. High-Scale System Topology

To sustain **18,000+ concurrent fans** and **8,000+ votes in a 10-second burst** without throttling, the architecture decouples **live write ingestion**, **real-time push delivery**, **state caching**, **fan response resolution & emotional recognition**, and **asynchronous scoring**.

```
                           [ 18,000+ Fans (ROAR Mobile / Web) ]
                                      │              ▲
                       HTTPS (Votes)  │              │ WebSockets (Pushes & Recognition Cards)
                                      ▼              │
                         ┌───────────────────────────────┐
                         │   AWS API Gateway (HTTP/WS)   │
                         └───────┬───────────────┬───────┘
                                 │               │
                                 ▼               │
                        ┌─────────────────┐      │
                        │ Next.js Lambdas │      │
                        └────────┬────────┘      │
                                 │               │
              ┌──────────────────┴───────────────┴──────────────────┐
              ▼                                                     ▼
   ┌──────────────────────┐                              ┌──────────────────────┐
   │    Redis Cluster     │                              │   Amazon DynamoDB    │
   │   (Upstash/Elasti)   │                              │ (Pre-warmed Tables)  │
   ├──────────────────────┤                              ├──────────────────────┤
   │ - Live Moment Cache  │                              │ - Primary Vote Items │
   │ - Sharded Counters   │                              │ - Recognition Receipts│
   │ - HyperLogLog (Users)│                              │ - Match & Scorecards │
   │ - Sorted Set (Ranks) │                              │ - Audit Ledger       │
   │ - Pub/Sub Dispatch   │                              │ - Room Meta / State  │
   └──────────────────────┘                              └──────────┬───────────┘
                                                                    │
                                                         DynamoDB Streams / Admin Trigger
                                                                    │
                                                                    ▼
                                                         ┌──────────────────────┐
                                                         │ Resolution Worker    │
                                                         │ (SQS + Lambda Batch) │
                                                         └──────────┬───────────┘
                                                                    │
                        ┌───────────────────────────────────────────┴───────────────────────────────────────────┐
                        ▼                                                                                       ▼
         [ Phase 1: Fan Resolution & ]                                                           [ Phase 2: ACID Gamification & ]
         [  Contribution Recognition  ]                                                           [      Wallet Settlement       ]
         ├───────────────────────────┤                                                           ├──────────────────────────────┤
         │ - Evaluate User Stance    │                                                           │ - TransactWrite Balance Add  │
         │ - Zero-Loss Affirmation   │                                                           │ - Deterministic Ledger TX    │
         │ - Guaranteed Return SXP   │                                                           │ - Match Scorecard Update     │
         │ - Re-engagement Teaser    │                                                           │ - Series Streaks Update      │
         └─────────────┬─────────────┘                                                           └──────────────────────────────┘
                       │
                       ▼ (Sub-second Celebration Modal Push)
         [ AWS API Gateway WebSockets ] ───► [ 18,000+ Fans Feeling Valued & Ready to Re-engage ]
```

---

## 2. Partition Strategy & Eliminating Hot Keys

### 2.1 The 1,000 WCU / Partition Limit Fix
DynamoDB limits each partition key to **1,000 writes/second**. Placing all votes, reactions, and room meta under a single `ROOM#<roomId>` partition crashes at scale. 

* **Partition Sharding**: High-throughput vote items and reaction items are sharded across 16 partition buckets:
  * `PK`: `MATCH#<matchId>#VOTES_P<0-15>` (Derived via `hash(userId) % 16`)
  * `SK`: `VOTE#<momentId>#<userId>`
* **Moment & Room Headers**: Kept on isolated configuration keys (`MATCH#<matchId>#CONFIG`, `ROOM#<roomId>#META`) and **NEVER updated on every vote**.
* **Zero Hot Counters in Vote Path**: Vote submissions do **not** execute `ADD` or transactions on the parent moment or room metadata. Vote ingestion is a pure, single `PutItem` with a conditional expression.

### 2.2 Eliminating GSI Hot Keys
* **Anti-Pattern Removed**: Removed `status-createdAt-index` where `status = "live"` acted as a single partition key for all active items across the entire company.
* **Production Pattern**: Active moments for a match room are tracked in a Redis Set (`match:<matchId>:active_moments`) with TTL. The client queries the Redis cache or receives a WebSocket push. DynamoDB GSIs are reserved for non-realtime admin queries using composite keys:
  * GSI1 PK: `matchId`
  * GSI1 SK: `category#createdAt`

---

## 3. Storage Layer: Schemas & Data Models

### 3.1 Table: `MatchMoments` (Dedicated High-Throughput Table)
* **Table Settings**: On-Demand with warm throughput provisioned prior to match kickoff. TTL enabled on `ttl` attribute.
* **Primary Key**: `pk` (String), `sk` (String)

#### Entity 1: Moment Configuration Item
Created by Admin / Feed prior to or during the match.

* **PK**: `MATCH#<matchId>#CONFIG`
* **SK**: `MOMENT#<momentUlid>` *(Time-sortable ULID guarantees strict chronological order even within the same over)*
* **Attributes**:
```json
{
  "pk": "MATCH#match_ind_nz_20261022#CONFIG",
  "sk": "MOMENT#01JBA49G8R00001Z7M2X3K9Q1A",
  "momentId": "mom_01JBA49G8R",
  "matchId": "match_ind_nz_20261022",
  "roomId": "room_ind_nz_t20i",
  "innings": 1,
  "over": 3.0,
  "ball": 0,
  "stage": "NZ_INNINGS_EARLY_OVERS",
  "category": "PREDICTION",
  "cardType": "LIVE_PREDICTION",
  "title": "How many runs in this over?",
  "subTitle": "Over 3 • NZ Batting",
  "priority": 100,
  "placement": "top_sticky_dock",
  "ruleVersion": "cricket_v1.2",
  "options": [
    { "id": "opt_a", "label": "6-10", "emoji": "🏏" },
    { "id": "opt_b", "label": "11-15", "emoji": "💥" }
  ],
  "pointsPositive": 10,
  "pointsNegative": 0,
  "status": "live",
  "lockTime": 1792742720000,
  "expiresAt": 1792743000000,
  "publishedAt": 1792742600000,
  "resolvedAt": null,
  "winningOptionId": null,
  "ttl": 1795334400
}
```

---

#### Entity 2: Fan Vote Record
Written by the fan on vote submission. Independent item, zero cross-item contention.

* **PK**: `MATCH#<matchId>#VOTES_P<0-15>` *(Sharded across 16 partitions)*
* **SK**: `VOTE#<momentId>#<userId>`
* **Attributes**:
```json
{
  "pk": "MATCH#match_ind_nz_20261022#VOTES_P7",
  "sk": "VOTE#mom_01JBA49G8R#usr_abhay_45",
  "momentId": "mom_01JBA49G8R",
  "matchId": "match_ind_nz_20261022",
  "userId": "usr_abhay_45",
  "selectedOptionId": "opt_a",
  "lockTime": 1792742720000,
  "submittedAt": 1792742635000,
  "status": "submitted",
  "isCorrect": null,
  "settledAt": null,
  "ttl": 1795334400
}
```

---

#### Entity 3: Quick Emoji Reaction
* **PK**: `MATCH#<matchId>#REACTS_P<0-15>`
* **SK**: `REACT#<momentId>#<userId>`
* **Attributes**:
```json
{
  "pk": "MATCH#match_ind_nz_20261022#REACTS_P3",
  "sk": "REACT#mom_01JBA49G8R#usr_suzy_89",
  "momentId": "mom_01JBA49G8R",
  "matchId": "match_ind_nz_20261022",
  "userId": "usr_suzy_89",
  "reaction": "fire",
  "submittedAt": 1792742640000,
  "ttl": 1795334400
}
```

---

#### Entity 4: Non-Prediction Moment Types
Covers Debates, Live Polls, and Innings Break Ratings.

* **PK**: `MATCH#<matchId>#CONFIG`
* **SK**: `MOMENT#<ulid>`
* **Attributes**:
```json
{
  "pk": "MATCH#match_ind_nz_20261022#CONFIG",
  "sk": "MOMENT#01JBA49Z9K00002B4N6M8P1Q2C",
  "momentId": "mom_innings_break_rate",
  "matchId": "match_ind_nz_20261022",
  "category": "INNINGS_BREAK_RATING",
  "cardType": "STAR_RATING",
  "title": "Rate New Zealand's Innings (225/4)",
  "status": "live",
  "lockTime": 1792746000000,
  "ratingScale": 5,
  "ttl": 1795334400
}
```

---

### 3.2 Fan Response Resolution & Contribution Recognition Layer

> [!IMPORTANT]
> **The Retention Psychology Gate**: Gamification (points, badges, leaderboards) fails if fans who predict incorrectly feel penalized or ignored. In live sports, 60–75% of predictions are factually incorrect on any single ball or over. If an incorrect vote results in a cold failure message or zero feedback, churn spikes and fans drop out within 2–3 overs.
> **Rule of Engagement**: Every submitted fan response must be **resolved and recognized with emotional affirmation BEFORE gamification balances are finalized**. Every fan—winner or non-winner—must feel that **their participation meaningfully contributed to the stadium pulse, earned guaranteed effort XP, and preserved their match streak**, seamlessly hooking them into the very next moment.

#### The Three Pillars of Meaningful Fan Recognition:
1. **Collective Voice & Stadium Impact**:
   - Every vote, debate stance, and rating directly shapes the live room sentiment displayed across mobile apps and stadium broadcast feeds.
   - Fans are shown their social proof: *"You and 3,420 fans stood together backing the aggressive boundary surge!"*
2. **The Zero-Loss Principle (Effort & Courage Recognition)**:
   - **Accurate Predictors**: Celebrated for elite cricket IQ, tactical insight, and leaderboard jumps.
   - **Contrarian / Underdog Predictors (Incorrect)**: Celebrated for daring and loyalty! Awarded **Guaranteed Participation SXP (+2 SXP)** and match presence streak protection. They *never* leave empty-handed.
   - **Interactive Voice (Polls / Debates / Ratings)**: Awarded **Community Voice SXP (+5 SXP)** with live pulse impact badges.
3. **The Immediate Re-engagement Hook (Next-Moment Onboarding)**:
   - Recognition is not a dead end. Every celebration card concludes with an actionable bridge to the upcoming over: *"Over 4 begins in 25s — Bumrah takes the ball! Ready to defend your streak?"*

---

#### Entity 1: Winning Fan Recognition Receipt Item
Stored within the high-throughput table under sharded partitions matching vote shards, ensuring zero write contention during mass resolutions.

* **PK**: `MATCH#<matchId>#RECEIPTS_P<0-15>` *(Derived via `hash(userId) % 16`)*
* **SK**: `RECEIPT#<momentId>#<userId>`
* **GSI1 PK**: `USER#<userId>`
* **GSI1 SK**: `RECEIPT#<matchId>#<momentId>`
* **Attributes**:
```json
{
  "pk": "MATCH#match_ind_nz_20261022#RECEIPTS_P7",
  "sk": "RECEIPT#mom_01JBA49G8R#usr_abhay_45",
  "receiptId": "rcpt_01JBA49G8R_usr_abhay_45",
  "momentId": "mom_01JBA49G8R",
  "matchId": "match_ind_nz_20261022",
  "userId": "usr_abhay_45",
  "category": "PREDICTION",
  "userSelectedOptionId": "opt_a",
  "winningOptionId": "opt_a",
  "resolutionOutcome": "CORRECT_WIN",
  "recognitionArchetype": "SHARP_ORACLE",
  "archetypeBadgeIcon": "🔮",
  "affirmationTitle": "Tactical Visionary!",
  "affirmationMessage": "Spot-on cricket IQ! You anticipated the 6-10 run squeeze before the over even began.",
  "communityImpact": {
    "fansWithSameStance": 4210,
    "crowdSharePercent": 42,
    "stadiumVolumeContribution": "+180 Roars",
    "consensusStatus": "Crowd Favorite"
  },
  "rewardsEarned": {
    "accuracySxp": 10,
    "participationContributionSxp": 2,
    "streakBonusSxp": 3,
    "totalSxpAwarded": 15
  },
  "streakState": {
    "currentMatchStreak": 4,
    "isPreserved": true,
    "streakTier": "OVER_WARRIOR_TIER_1",
    "nextMilestoneRemaining": 1
  },
  "reengagementHook": {
    "nextMomentId": "mom_01JBA52K9T",
    "teaserTitle": "Over 4: Bumrah Bowling",
    "promptCopy": "Can Bumrah strike in his opening over? Call it now to reach a 5-streak milestone!",
    "startsInSeconds": 25
  },
  "clientAcknowledged": false,
  "resolvedAt": 1792742840000,
  "ttl": 1795334400
}
```

---

#### Entity 2: Non-Winning Fan Recognition Receipt (Zero-Loss Principle)
When a prediction doesn't land, the system acknowledges the fan's conviction, awards participation SXP, and protects their loyalty streak.

* **PK**: `MATCH#<matchId>#RECEIPTS_P<0-15>`
* **SK**: `RECEIPT#<momentId>#<userId>`
* **Attributes**:
```json
{
  "pk": "MATCH#match_ind_nz_20261022#RECEIPTS_P3",
  "sk": "RECEIPT#mom_01JBA49G8R#usr_suzy_89",
  "receiptId": "rcpt_01JBA49G8R_usr_suzy_89",
  "momentId": "mom_01JBA49G8R",
  "matchId": "match_ind_nz_20261022",
  "userId": "usr_suzy_89",
  "category": "PREDICTION",
  "userSelectedOptionId": "opt_b",
  "winningOptionId": "opt_a",
  "resolutionOutcome": "CONTRARIAN_MAVERICK",
  "recognitionArchetype": "FEARLESS_ATTACKER",
  "archetypeBadgeIcon": "⚡",
  "affirmationTitle": "Fearless Call!",
  "affirmationMessage": "You backed the big boundary assault with 3,420 fans! Your bold stand pushed the stadium volume meter to peak intensity.",
  "communityImpact": {
    "fansWithSameStance": 3420,
    "crowdSharePercent": 34,
    "stadiumVolumeContribution": "+140 Roars",
    "consensusStatus": "Bold Underdog Stand"
  },
  "rewardsEarned": {
    "accuracySxp": 0,
    "participationContributionSxp": 2,
    "streakBonusSxp": 0,
    "totalSxpAwarded": 2
  },
  "streakState": {
    "currentMatchStreak": 3,
    "isPreserved": true,
    "streakTier": "GRIT_CONTRIBUTOR",
    "note": "Loyalty preserved! Active match presence streak intact."
  },
  "reengagementHook": {
    "nextMomentId": "mom_01JBA52K9T",
    "teaserTitle": "Over 4: Bumrah Attack",
    "promptCopy": "Bumrah takes the ball! Back the bowler or back the bat?",
    "startsInSeconds": 25
  },
  "clientAcknowledged": false,
  "resolvedAt": 1792742840000,
  "ttl": 1795334400
}
```

---

#### Entity 3: Interactive Voice Recognition (Polls, Debates, Inning Ratings)
Ensures non-prediction moments also deliver direct emotional payoff and voice recognition.

* **PK**: `MATCH#<matchId>#RECEIPTS_P<0-15>`
* **SK**: `RECEIPT#<momentId>#<userId>`
* **Attributes**:
```json
{
  "pk": "MATCH#match_ind_nz_20261022#RECEIPTS_P11",
  "sk": "RECEIPT#mom_innings_break_rate#usr_vikram_22",
  "receiptId": "rcpt_rate_usr_vikram_22",
  "momentId": "mom_innings_break_rate",
  "matchId": "match_ind_nz_20261022",
  "userId": "usr_vikram_22",
  "category": "INNINGS_BREAK_RATING",
  "resolutionOutcome": "COMMUNITY_VOICE_AMPLIFIED",
  "recognitionArchetype": "STADIUM_PULSE_MAKER",
  "archetypeBadgeIcon": "📢",
  "affirmationTitle": "Voice on the Big Screen!",
  "affirmationMessage": "Your 4-star rating joined 12,800 fans to set the official 1st Innings Match Mood.",
  "rewardsEarned": {
    "accuracySxp": 0,
    "participationContributionSxp": 5,
    "streakBonusSxp": 0,
    "totalSxpAwarded": 5
  },
  "reengagementHook": {
    "teaserTitle": "Chasing 226",
    "promptCopy": "India's chase starts in 2 minutes. Get ready for the first ball prediction!"
  },
  "resolvedAt": 1792746100000,
  "ttl": 1795334400
}
```

---

#### Entity 4: Ephemeral Redis Recognition Push Payload (`recognition:<userId>:latest`)
Cached in Redis with a 180-second TTL. Pushed over WebSockets via AWS API Gateway within **< 800 ms** of moment resolution so fans receive instant visual recognition on their mobile devices without querying DynamoDB.

* **Key**: `recognition:<userId>:latest`
* **TTL**: 180 seconds
* **Payload Structure**:
```json
{
  "type": "MOMENT_RECOGNITION_CARD",
  "momentId": "mom_01JBA49G8R",
  "outcome": "CORRECT_WIN",
  "badge": "🔮 SHARP_ORACLE",
  "headline": "Tactical Visionary!",
  "message": "Spot-on cricket IQ! You called the 6-10 run squeeze.",
  "communityVoice": "You stood with 4,210 fans (42% of stadium).",
  "sxpDelta": "+15 SXP",
  "streak": "4 in a row 🔥",
  "nextPrompt": {
    "over": 4,
    "teaser": "Bumrah on the attack — keep your streak alive!",
    "startsIn": 25
  }
}
```

---

#### Entity 5: Moment Collective Pulse & Stadium Impact Item
Stores aggregated match sentiment and proof of collective fan power.

* **PK**: `MATCH#<matchId>#CONFIG`
* **SK**: `MOMENT_PULSE#<momentUlid>`
* **Attributes**:
```json
{
  "pk": "MATCH#match_ind_nz_20261022#CONFIG",
  "sk": "MOMENT_PULSE#01JBA49G8R00001Z7M2X3K9Q1A",
  "momentId": "mom_01JBA49G8R",
  "matchId": "match_ind_nz_20261022",
  "totalFanVoices": 18420,
  "totalRoarsGenerated": 320400,
  "winningOption": "opt_a",
  "winningOptionCount": 7736,
  "contrarianOptionCount": 6262,
  "contrarianPercent": 34,
  "mostPassionateSector": "Mumbai West Stand (Roar Level 94dB)",
  "resolvedAt": 1792742840000,
  "ttl": 1795334400
}
```

---

### 3.3 Table: `GamificationAndWallet`
Maintains user balances, deterministic ledgers, and match scorecards. Executed and synchronized **only after fan resolution and recognition payloads have been finalized**.

* **Primary Key**: `entityId` (String, PK), `sk` (String, SK)

#### Entity 1: User Wallet Balance Item
Maintains current coin/SXP balance with atomic ACID transactions. Includes breakdown of earned value to reinforce the feeling of accumulated contribution.

* **PK (`entityId`)**: `USER#<userId>`
* **SK (`sk`)**: `WALLET#SXP`
* **Attributes**:
```json
{
  "entityId": "USER#usr_abhay_45",
  "sk": "WALLET#SXP",
  "userId": "usr_abhay_45",
  "balance": 1420,
  "lifetimeEarned": 5840,
  "lifetimeAccuracySxp": 4200,
  "lifetimeParticipationSxp": 1120,
  "lifetimeCommunitySxp": 520,
  "updatedAt": 1792742840000
}
```

---

#### Entity 2: Deterministic Ledger Transaction Item
Prevents duplicate credits on retries via deterministic primary keys. Categorizes rewards into accuracy, guaranteed participation, and community voice.

* **PK (`entityId`)**: `USER#<userId>`
* **SK (`sk`)**: `TX#<momentId>` *(Deterministic key ensures exactly-once execution)*
* **Attributes**:
```json
{
  "entityId": "USER#usr_abhay_45",
  "sk": "TX#mom_01JBA49G8R",
  "txId": "tx_mom_01JBA49G8R_usr_abhay_45",
  "userId": "usr_abhay_45",
  "amount": 15,
  "type": "MOMENT_PREDICTION_WIN",
  "rewardBreakdown": {
    "accuracy": 10,
    "participationContribution": 2,
    "streakBonus": 3
  },
  "momentId": "mom_01JBA49G8R",
  "matchId": "match_ind_nz_20261022",
  "balanceAfter": 1420,
  "createdAt": 1792742840000
}
```

*(For non-winning voters, the ledger records type: `"MOMENT_PARTICIPATION_CREDIT"` with amount: `2` SXP, ensuring an immutable audit trail of effort rewards).*

---

#### Entity 3: Match Performance Scorecard
Snapshot of match progress. Updated in batches by the resolution worker. Tracks active contribution metrics alongside accuracy to celebrate high-effort fans.

* **PK (`entityId`)**: `MATCH#<matchId>`
* **SK (`sk`)**: `SCORECARD#<userId>`
* **Attributes**:
```json
{
  "entityId": "MATCH#match_ind_nz_20261022",
  "sk": "SCORECARD#usr_abhay_45",
  "userId": "usr_abhay_45",
  "username": "Abhay",
  "avatarUrl": "https://cdn.sportsfan360.com/avatars/abhay.png",
  "totalMomentsEngaged": 10,
  "correctPredictions": 7,
  "incorrectPredictions": 3,
  "boldCallsMade": 3,
  "participationPointsEarned": 20,
  "accuracyPointsEarned": 162,
  "pointsEarned": 182,
  "activeMatchStreak": 4,
  "unlockedBadges": ["SUPER_FAN", "LIVE_STREAK", "SHARP_ORACLE"],
  "updatedAt": 1792742840000
}
```

---

#### Entity 4: Between-Match Retention & Series Streaks
Tracks durability and repeat behavior across matches (Image 3). Rewards consistent attendance and engagement rate over raw win rate alone.

* **PK (`entityId`)**: `USER#<userId>`
* **SK (`sk`)**: `SERIES#<seriesId>`
* **Attributes**:
```json
{
  "entityId": "USER#usr_abhay_45",
  "sk": "SERIES#ind_vs_nz_t20_series_2026",
  "seriesId": "ind_vs_nz_t20_series_2026",
  "matchesParticipated": 1,
  "cumulativeSeriesPoints": 182,
  "currentStreak": 7,
  "highestStreak": 7,
  "matchEngagementRate": "100%",
  "optInDayDebates": true,
  "lastActiveTimestamp": 1792742840000
}
```

---

## 4. Redis In-Memory Layer (Speed, Counters & Real-Time Ranks)

Redis sits in front of DynamoDB to shield it from live read/write heat.

| Function | Redis Data Structure | Key Pattern | Operations |
| :--- | :--- | :--- | :--- |
| **Option Vote Counters** | Hash | `moment:<id>:counts` | `HINCRBY moment:<id>:counts opt_a 1` |
| **Unique Match Participants** | HyperLogLog + Set | `match:<id>:participants` | `PFADD match:<id>:participants <userId>` (O(1)) |
| **Live Leaderboard** | Sorted Set (ZSET) | `match:<id>:leaderboard` | `ZINCRBY match:<id>:leaderboard 10 <userId>` |
| **Top 50 Ranks Read** | Sorted Set Query | `match:<id>:leaderboard` | `ZREVRANGE match:<id>:leaderboard 0 49 WITHSCORES` |
| **User's Current Rank** | Sorted Set Query | `match:<id>:leaderboard` | `ZREVRANK match:<id>:leaderboard <userId>` (O(log N)) |
| **Active Moments Cache** | JSON / String | `moment:<id>:meta` | `GET moment:<id>:meta` (Sub-millisecond) |
| **Instant Recognition Cards** | JSON String (TTL 180s) | `recognition:<userId>:latest` | `SETEX recognition:<userId>:latest 180 <payload>` |
| **Collective Pulse Aggregates** | Hash | `moment:<id>:pulse` | `HGETALL moment:<id>:pulse` |

---

## 5. End-to-End Operational Workflows & Query Recipes

### Recipe 1: Atomic Vote Ingestion with Strict Lock Enforcement

When a fan submits a prediction vote, the backend verifies timing and executes a single idempotent write.

```typescript
// Next.js API: POST /api/roar/matches/[matchId]/moments/[momentId]/vote
export async function POST(req: NextRequest) {
  const { matchId, momentId, selectedOptionId, lockTime, clientTimestamp } = await req.json();
  const userId = getAuthenticatedUserId(req);
  const serverNow = Date.now();

  // 1. Enforce strict lock-time gate
  if (serverNow >= lockTime) {
    emitTelemetry("stale_prompt_suppressed", {
      reason: "expired_lock_time",
      event_age_seconds: Math.floor((serverNow - lockTime) / 1000),
      user_id: userId,
      moment_id: momentId,
      match_id: matchId,
      timestamp: serverNow
    });
    return NextResponse.json({ error: "Moment voting is locked" }, { status: 409 });
  }

  // 2. Determine sharded partition (0 - 15)
  const partitionId = Math.abs(hashString(userId)) % 16;
  const shardKey = `MATCH#${matchId}#VOTES_P${partitionId}`;

  // 3. Idempotent PutItem to DynamoDB
  try {
    await docClient.send(new PutCommand({
      TableName: "MatchMoments",
      Item: {
        pk: shardKey,
        sk: `VOTE#${momentId}#${userId}`,
        momentId,
        matchId,
        userId,
        selectedOptionId,
        lockTime,
        submittedAt: serverNow,
        status: "submitted",
        ttl: Math.floor(serverNow / 1000) + (30 * 86400) // 30-day TTL
      },
      // Guarantee exactly-once voting
      ConditionExpression: "attribute_not_exists(sk)"
    }));
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Already voted on this moment" }, { status: 409 });
    }
    throw err;
  }

  // 4. Update in-memory Redis counters (fire-and-forget / non-blocking)
  redis.multi()
    .hincrby(`moment:${momentId}:counts`, selectedOptionId, 1)
    .pfadd(`match:${matchId}:participants`, userId)
    .exec()
    .catch((err) => console.error("Redis counter sync error:", err));

  // 5. Emit KPI Action Telemetry
  emitTelemetry("fan_action_completed", {
    user_id: userId,
    match_id: matchId,
    prediction_id: momentId,
    action_type: "prediction_vote",
    lock_time: lockTime,
    result_state: "submitted",
    timestamp: serverNow
  });

  return NextResponse.json({ success: true, submittedAt: serverNow });
}
```

---

### Recipe 2: Live Distribution Read (Eliminating Stale Percentages)

Percentages are **computed on read** from the Redis hash, not stored on the base item.

```typescript
export async function getMomentPercentages(momentId: string, options: string[]) {
  const counts = await redis.hgetall<Record<string, string>>(`moment:${momentId}:counts`) || {};
  
  let total = 0;
  const parsedCounts: Record<string, number> = {};
  for (const opt of options) {
    const count = parseInt(counts[opt] || "0", 10);
    parsedCounts[opt] = count;
    total += count;
  }

  const percentages: Record<string, number> = {};
  for (const opt of options) {
    percentages[opt] = total === 0 ? 0 : Math.round((parsedCounts[opt] / total) * 100);
  }

  return { totalVotes: total, optionCounts: parsedCounts, percentages };
}
```

---

### Recipe 3: Two-Phase Resolution Worker: Fan Recognition First, Gamification ACID Settlement Second

When an over or ball completes, resolving 18,000 votes requires an asynchronous queue worker to avoid serverless timeouts, write throttling, and fan churn. 

Crucially, **both winning and non-winning fans are processed**: the worker first evaluates the user's stance and constructs a **high-value emotional recognition receipt**, dispatches it to their mobile screen via WebSockets, and then atomically executes the gamification wallet update.

```
 [ Admin selects "Opt A" as winner ]
                 │
                 ▼
 [ SQS Queue: match-resolution-queue ]
                 │
      ┌──────────┴──────────┐
      ▼ (Concurrent Batches)▼
 [ Resolution Worker ] [ Resolution Worker ]
      │                     │
      ├─ Query shard P0-P7  ├─ Query shard P8-P15
      ├─ Batch-evaluate     ├─ Batch-evaluate
      ├─ Credit Wallets     ├─ Credit Wallets
      └─ Update Leaderboard └─ Update Leaderboard
```

#### Step-by-Step Resolution Execution:
1. **Admin sets status**: Admin calls `/api/roar/admin/moments/[momentId]/resolve` with `winningOptionId: "opt_a"`.
2. **Lock Moment State**:
   ```typescript
   await docClient.send(new UpdateCommand({
     TableName: "MatchMoments",
     Key: { pk: `MATCH#${matchId}#CONFIG`, sk: `MOMENT#${momentUlid}` },
     UpdateExpression: "SET #st = :res, winningOptionId = :w, resolvedAt = :now",
     ExpressionAttributeNames: { "#st": "status" },
     ExpressionAttributeValues: { ":res": "resolved", ":w": winningOptionId, ":now": Date.now() }
   }));
   ```
3. **Dispatch SQS Chunks**: The API enqueues 16 messages (one for each shard `P0` through `P15`) into Amazon SQS.
4. **Worker Processes Shard (Batch of 25 Voters)**:
   ```typescript
   export async function processResolutionShard(shardId: number, moment: MomentConfig, winningOpt: string) {
     const serverNow = Date.now();
     const shardKey = `MATCH#${moment.matchId}#VOTES_P${shardId}`;
     const receiptsShardKey = `MATCH#${moment.matchId}#RECEIPTS_P${shardId}`;

     // 1. Fetch all votes in this shard for this moment
     const votes = await queryShardVotes(shardKey, moment.momentId);

     for (const vote of votes) {
       const isWinner = vote.selectedOptionId === winningOpt;

       // 2. Multi-tier Scoring (The Zero-Loss Principle)
       const accuracySxp = isWinner ? (moment.pointsPositive || 10) : 0;
       const participationContributionSxp = 2; // Guaranteed effort XP for taking part!
       const streakBonusSxp = isWinner ? 3 : 0;
       const totalAwardedSxp = accuracySxp + participationContributionSxp + streakBonusSxp;

       // 3. Generate Emotional Recognition & Psychological Affirmation
       const recognition = {
         receiptId: `rcpt_${moment.momentId}_${vote.userId}`,
         outcome: isWinner ? "CORRECT_WIN" : "CONTRARIAN_MAVERICK",
         archetype: isWinner ? "SHARP_ORACLE" : "FEARLESS_ATTACKER",
         badgeIcon: isWinner ? "🔮" : "⚡",
         affirmationTitle: isWinner ? "Tactical Visionary!" : "Fearless Stand!",
         affirmationMessage: isWinner 
           ? `Spot-on cricket IQ! You called the ${winningOpt} outcome before the over began.`
           : `You backed your conviction with 3,420 fans! Your bold stand pushed the stadium volume meter to peak roar.`,
         communityImpact: {
           fansWithSameStance: 3420,
           crowdSharePercent: 34,
           stadiumVolumeContribution: "+140 Roars"
         },
         rewards: { accuracySxp, participationContributionSxp, streakBonusSxp, totalAwardedSxp },
         reengagementHook: {
           teaser: "Over 4 starts in 25s — Bumrah attacks! Ready to defend your streak?",
           nextMomentId: "mom_next_over"
         }
       };

       // 4. Sub-second WebSocket Push (Fan gets recognized on device immediately!)
       await redis.setex(`recognition:${vote.userId}:latest`, 180, JSON.stringify(recognition));
       await pushWebSocketToUser(vote.userId, {
         type: "MOMENT_RECOGNITION_CARD",
         ...recognition
       });

       // 5. Atomic ACID Settlement across Gamification & Receipts
       await docClient.send(new TransactWriteCommand({
         TransactItems: [
           // A. Update User Wallet Balance (Increment both balance and lifetime category counters)
           {
             Update: {
               TableName: "GamificationAndWallet",
               Key: { entityId: `USER#${vote.userId}`, sk: "WALLET#SXP" },
               UpdateExpression: `
                 ADD balance :tot, 
                     lifetimeEarned :tot, 
                     lifetimeAccuracySxp :acc, 
                     lifetimeParticipationSxp :part 
                 SET updatedAt = :now
               `,
               ExpressionAttributeValues: {
                 ":tot": totalAwardedSxp,
                 ":acc": accuracySxp,
                 ":part": participationContributionSxp,
                 ":now": serverNow
               }
             }
           },
           // B. Deterministic Idempotent Ledger Entry (Guarantees exactly-once credit)
           {
             Put: {
               TableName: "GamificationAndWallet",
               Item: {
                 entityId: `USER#${vote.userId}`,
                 sk: `TX#${moment.momentId}`,
                 txId: `tx_${moment.momentId}_${vote.userId}`,
                 userId: vote.userId,
                 amount: totalAwardedSxp,
                 type: isWinner ? "MOMENT_PREDICTION_WIN" : "MOMENT_PARTICIPATION_CREDIT",
                 rewardBreakdown: {
                   accuracy: accuracySxp,
                   participation: participationContributionSxp,
                   streak: streakBonusSxp
                 },
                 momentId: moment.momentId,
                 matchId: moment.matchId,
                 createdAt: serverNow
               },
               ConditionExpression: "attribute_not_exists(sk)"
             }
           },
           // C. Persist Fan Recognition Receipt Item
           {
             Put: {
               TableName: "MatchMoments",
               Item: {
                 pk: receiptsShardKey,
                 sk: `RECEIPT#${moment.momentId}#${vote.userId}`,
                 receiptId: recognition.receiptId,
                 momentId: moment.momentId,
                 matchId: moment.matchId,
                 userId: vote.userId,
                 resolutionOutcome: recognition.outcome,
                 recognitionArchetype: recognition.archetype,
                 affirmationTitle: recognition.affirmationTitle,
                 affirmationMessage: recognition.affirmationMessage,
                 rewardsEarned: recognition.rewards,
                 resolvedAt: serverNow,
                 ttl: Math.floor(serverNow / 1000) + (30 * 86400)
               }
             }
           },
           // D. Increment User's Match Scorecard Progress
           {
             Update: {
               TableName: "GamificationAndWallet",
               Key: { entityId: `MATCH#${moment.matchId}`, sk: `SCORECARD#${vote.userId}` },
               UpdateExpression: `
                 ADD totalMomentsEngaged :one, 
                     correctPredictions :win, 
                     incorrectPredictions :loss, 
                     pointsEarned :tot 
                 SET updatedAt = :now
               `,
               ExpressionAttributeValues: {
                 ":one": 1,
                 ":win": isWinner ? 1 : 0,
                 ":loss": isWinner ? 0 : 1,
                 ":tot": totalAwardedSxp,
                 ":now": serverNow
               }
             }
           }
         ]
       }));

       // 6. Update Live Leaderboard in Redis
       await redis.zincrby(`match:${moment.matchId}:leaderboard`, totalAwardedSxp, vote.userId);
     }
   }
   ```

---

### Recipe 4: Post-Match Participant Count & Summary Retrieval

Answers: **Where does the data come from at the end of the match?**

* **Total Participants**: Read via Redis `PFCOUNT match:<matchId>:participants` in **0.4 milliseconds**.
* **Persisted Archive**: During match closeout, the exact number is flushed to the match record in DynamoDB.

```typescript
export async function getMatchSummary(matchId: string, userId: string) {
  // 1. Total unique match participants from HyperLogLog (sub-millisecond)
  const totalUniqueFans = await redis.pfcount(`match:${matchId}:participants`);

  // 2. Fetch User's rank from Redis Sorted Set
  const userZeroRank = await redis.zrevrank(`match:${matchId}:leaderboard`, userId);
  const userScore = await redis.zscore(`match:${matchId}:leaderboard`, userId) || 0;
  const userRank = userZeroRank !== null ? userZeroRank + 1 : null;

  // 3. Fetch User's detailed scorecard from DynamoDB
  const scorecardRes = await docClient.send(new GetCommand({
    TableName: "GamificationAndWallet",
    Key: { entityId: `MATCH#${matchId}`, sk: `SCORECARD#${userId}` }
  }));

  const scorecard = scorecardRes.Item || {};

  return {
    matchId,
    communitySummary: {
      totalParticipants: totalUniqueFans, // e.g. 18,742
    },
    userSummary: {
      userId,
      pointsEarned: userScore,
      rank: userRank,
      correctPredictions: scorecard.correctPredictions || 0,
      totalPredictions: scorecard.totalMomentsEngaged || 0,
      unlockedBadges: scorecard.unlockedBadges || []
    }
  };
}
```

---

## 6. Live Push Dispatch Layer (Zero Client Polling)

Serverless Next.js functions cannot maintain stateful WebSocket connections. The push architecture utilizes **AWS API Gateway WebSocket API** backed by Redis Pub/Sub:

```
[ Admin triggers Over 3 Moment ]
              │
              ▼
    [ Redis Pub/Sub ]  (channel: match:<id>:events)
              │
              ▼
[ Dispatcher Lambda Container ]
              │
              ▼
[ AWS API Gateway WebSockets ]  (@connections/<connectionId>)
              │
              ▼
[ 18,000+ ROAR Client Devices ]  (Instant card popup without polling DynamoDB)
```

---

## 7. Telemetry & Analytics Pipeline (KPITable Compliance)

All telemetry events are structured with required identification keys (`event_id`, `timestamp`, `user_id`, `match_id`) and streamed to Amazon Kinesis Data Firehose $\rightarrow$ Amazon S3 $\rightarrow$ AWS Athena:

```typescript
export interface BaseTelemetryEvent {
  event_id: string;        // UUID v4
  timestamp: number;       // Unix epoch ms
  match_id: string;        // Current match
  user_id?: string;        // Active user (if applicable)
}

export interface MomentDetectedEvent extends BaseTelemetryEvent {
  event: "moment_detected";
  innings: number;
  over: number;
  ball: number;
  event_type: "PREDICTION" | "REACTION" | "POLL" | "INNINGS_BREAK";
  source: "admin_manual" | "sportsdata_feed";
  source_timestamp: number;
  confidence: number;
}

export interface FanActionCompletedEvent extends BaseTelemetryEvent {
  event: "fan_action_completed";
  user_id: string;
  prediction_id: string;
  action_type: "prediction_vote" | "quick_reaction" | "debate_reply";
  lock_time: number;
  result_state: "submitted" | "late_rejected";
}

export interface PredictionResolvedEvent extends BaseTelemetryEvent {
  event: "prediction_resolved";
  prediction_id: string;
  rule_version: string;
  outcome: string;
  resolved_at: number;
}

export interface FanRecognitionDeliveredEvent extends BaseTelemetryEvent {
  event: "fan_recognition_delivered";
  user_id: string;
  moment_id: string;
  outcome: "CORRECT_WIN" | "CONTRARIAN_MAVERICK" | "COMMUNITY_VOICE_AMPLIFIED";
  archetype: string;
  total_sxp_awarded: number;
  participation_sxp: number;
  delivery_latency_ms: number; // Duration between moment resolution and WebSocket delivery
}

export interface RetentionLoopReengagedEvent extends BaseTelemetryEvent {
  event: "retention_loop_reengaged";
  user_id: string;
  prior_moment_id: string;
  prior_outcome: "CORRECT_WIN" | "CONTRARIAN_MAVERICK" | "COMMUNITY_VOICE_AMPLIFIED";
  next_moment_id: string;
  seconds_to_reengage: number;
  active_streak: number;
}

export interface StalePromptSuppressedEvent extends BaseTelemetryEvent {
  event: "stale_prompt_suppressed";
  user_id: string;
  moment_id: string;
  reason: "expired_lock_time" | "superseded_by_higher_priority";
  event_age_seconds: number;
  priority: number;
}
```

---

## 8. Cold Archival & TTL Strategy

1. **Active Match Duration**: High-throughput vote items and reaction items live in `MatchMoments` with an automated `ttl` timestamp set to `epoch + 30 days`.
2. **Archival via DynamoDB Streams**:
   * DynamoDB Streams triggers a lightweight Lambda on item expiration/modification.
   * Compresses raw vote logs into **Apache Parquet** format on Amazon S3 partitioned by `year/month/match_id`.
   * Enables historical cohort queries in Amazon Athena / Redshift at zero primary table storage cost.
