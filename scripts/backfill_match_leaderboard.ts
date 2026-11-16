// One-off backfill of per-match SXP aggregates from historical ACT# activity rows.
// Idempotent (keyed on transactionId) — safe to re-run and safe to run while live traffic is writing.
//   npx tsx scripts/backfill_match_leaderboard.ts            # dry run
//   npx tsx scripts/backfill_match_leaderboard.ts --apply
import "./loadEnv";
import { docClient } from "../lib/dynamodb";
import { TABLES } from "../lib/tableNames";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { cleanMatchId, isMatchScoredType, recordMatchPoints } from "../lib/matchLeaderboard";

const APPLY = process.argv.includes("--apply");
const engagementMatch = new Map<string, string>();

async function matchOfEngagement(engagementId: string): Promise<string> {
  const hit = engagementMatch.get(engagementId);
  if (hit !== undefined) return hit;
  let m = "";
  try {
    const r = await docClient.send(new GetCommand({
      TableName: TABLES.SocialAndContent,
      Key: { contentId: `ENGAGEMENT#${engagementId}`, sk: "ENGAGEMENT#META" },
    }));
    m = cleanMatchId(r.Item?.matchId);
  } catch { /* leave empty */ }
  engagementMatch.set(engagementId, m);
  return m;
}

async function main() {
  console.log("Target table:", TABLES.GamificationAndWallet);
  if (!TABLES.GamificationAndWallet.endsWith("-dev")) {
    console.error("Refusing: target table is not a -dev table.");
    process.exit(1);
  }
  let lastKey: Record<string, any> | undefined;
  let scanned = 0, eligible = 0, applied = 0, noMatch = 0;
  do {
    const res = await docClient.send(new ScanCommand({
      TableName: TABLES.GamificationAndWallet,
      FilterExpression: "begins_with(sk, :p)",
      ExpressionAttributeValues: { ":p": "ACT#" },
      ExclusiveStartKey: lastKey,
    }));
    for (const it of res.Items ?? []) {
      scanned++;
      const type = String(it.type || "");
      const pts = Number(it.points || 0);
      if (!isMatchScoredType(type) || pts <= 0) continue;
      const engId = String(it.metadata?.engagementId || "");
      const matchId = cleanMatchId(it.metadata?.matchId) || (engId ? await matchOfEngagement(engId) : "");
      if (!matchId) { noMatch++; continue; }
      eligible++;
      if (!APPLY) continue;
      const ok = await recordMatchPoints({
        userId: String(it.userId),
        userName: it.userName,
        matchId,
        type,
        points: pts,
        transactionId: String(it.transactionId || String(it.sk).replace(/^ACT#/, "")),
        at: Number(it.createdAt || Date.now()),
      });
      if (ok) applied++;
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  console.log({ mode: APPLY ? "apply" : "dry-run", scanned, eligible, applied, skippedNoMatch: noMatch });
}

main().catch((e) => { console.error(e); process.exit(1); });
