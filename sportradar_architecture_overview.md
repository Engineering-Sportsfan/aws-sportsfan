# Sportradar API Integration & Scalability Architecture

## Executive Summary
This document provides a comprehensive overview of the completed technical integration for the Sportradar API 30-day trial. It also outlines the proposed Phase 2 caching architecture designed to handle high-frequency live sports data at scale while drastically reducing DynamoDB write costs.

---

## Phase 1: Completed API Integration

We have successfully established a secure connection to the Sportradar Cricket API and integrated it seamlessly into the `aws-sportsfan` backend environment, fully mapped to our AWS DynamoDB infrastructure.

### 1. Secure Authentication & Live Testing
- The Sportradar Live API key has been successfully acquired and securely injected into the backend `.env.local` configuration, ensuring it is never exposed to the frontend client.
- A secure read-only test was executed to prove end-to-end connectivity. The API successfully authenticated and returned today's live schedule.

**Terminal Test Results:**
```text
🛡️  Testing Sportradar API Safely (Read-Only) 🛡️
Hitting URL: https://api.sportradar.com/cricket-t2/en/schedules/2026-08-07/schedule.json
✅ Success! Fetched 29 live/scheduled matches for today.
🏏 Sample Match Found: Srilankan Lions vs Pakistan Panthers
🏟️  Venue: Unknown
```

### 2. The Data Normalization Adapter
- **Module Created:** `lib/ingestion/sportradarAdapter.ts`
- **Why we built it:** Sportradar's raw API response contains massive, deeply nested trees of irrelevant metadata (see payload example below). Injecting this directly would bloat and potentially break our database schemas.
- **Data Mapping & Safety:** This adapter acts as a protective translation firewall. It extracts *only* the specific data points we care about (like `team1`, `team2`, `match_result`, and `venue`) and standardizes them. It translates Sportradar's proprietary match statuses into our strict internal enums.
- **Strict Validation:** Every payload parsed by this adapter is rigorously validated against our existing Zod schemas (`MatchCreateSchema`) before it is ever allowed to touch DynamoDB.

<details>
<summary><b>View Raw Sportradar JSON Payload (Pre-Adapter)</b></summary>

```json
{
  "id": "sr:match:72728732",
  "tournament_round": {
    "type": "group",
    "number": 1,
    "competition_sport_event_number": 13
  },
  "season": {
    "id": "sr:season:142248",
    "name": "T20 Asian Legends League 2026",
    "start_date": "2026-06-02",
    "end_date": "2026-08-07",
    "year": "2026"
  },
  "scheduled": "2026-08-07T07:30:00+00:00",
  "start_time_tbd": false,
  "tournament": {
    "id": "sr:tournament:42377",
    "name": "T20 Asian Legends League",
    "type": "t20",
    "gender": "men",
    "sport": {
      "id": "sr:sport:21",
      "name": "Cricket"
    },
    "category": {
      "id": "sr:category:1959",
      "name": "International Clubs"
    }
  },
  "status": "not_started",
  "competitors": [
    {
      "id": "sr:competitor:344814",
      "name": "Srilankan Lions",
      "abbreviation": "SRL",
      "qualifier": "home",
      "gender": "male"
    },
    {
      "id": "sr:competitor:1356040",
      "name": "Pakistan Panthers",
      "abbreviation": "PAK",
      "qualifier": "away",
      "gender": "male"
    }
  ]
}
```
*The adapter strips away all `sr:` tags and nested objects, returning a clean, flat object ready for our database.*
</details>

### 3. The Data Ingestion Engine (Pull Service)
- **Endpoint Created:** `/app/api/cron/sportradar-sync/route.ts`
- **Functionality:** We built a fully functional Next.js App Router GET endpoint that acts as our secure bridge to Sportradar. 
- **Automation:** It is designed to be triggered autonomously via a scheduled background cron job (e.g., Vercel Cron or AWS EventBridge), removing the need for manual data fetching.
- **DynamoDB Operations:** Upon fetching and adapting the live data, this API natively utilizes our custom `@/lib/dualWrite` helper. It handles `upsert` operations directly into our AWS DynamoDB `Matches` table (with Firebase fallback support), ensuring our database state is always perfectly synchronized with the live match.

---

## Phase 2: Proposed Scalable Architecture (Production)

Writing high-frequency ball-by-ball updates directly to a persistent database (like DynamoDB) during a live match incurs significant write-costs (e.g., 240+ writes per T20 match). To mitigate this and improve latency, we propose a **Write-Deferred Caching Architecture**.

> [!TIP]
> **Cost Efficiency:** By utilizing an in-memory cache, we consolidate hundreds of expensive database writes into a single write operation per match, saving massive amounts of AWS compute budget.

### 1. The Live Memory Layer (Redis)
During a live match, the Data Ingestion Engine will parse the Sportradar data and write it **exclusively to an in-memory cache** (such as AWS ElastiCache / Redis), rather than directly to DynamoDB.
- **Speed:** Writing to RAM is instantaneous, allowing us to process high-frequency ball-by-ball updates with zero bottleneck.
- **Cost:** In-memory writes do not incur the per-operation fees associated with persistent databases.

### 2. Real-Time Frontend Delivery
The Next.js frontend application will fetch live scorecards directly from the Redis cache.
- Because the data lives entirely in memory, the system can serve millions of concurrent users querying the live score simultaneously with near-zero latency.

### 3. End-of-Match Database Flush
The persistent DynamoDB database is reserved strictly for historical record-keeping.
- The backend will monitor the `match_status` from Sportradar.
- When the API indicates the match has officially ended (e.g., `status = "ended"`), a background worker will extract the finalized scorecard from the Redis cache.
- It will perform **one single batch write** to DynamoDB via `dualWrite` to permanently archive the match.
- The Redis cache for that match is then cleared, freeing up memory for the next live event.


