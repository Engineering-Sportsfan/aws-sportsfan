// scripts/backfill-engagement-gsi.ts
// One-off: stamps engSource / engCreatedAt on existing engagement rows so they appear in the sparse
// EngagementsBySource GSI. NOT run automatically. Dry-run by default.
//
//   npx tsx scripts/backfill-engagement-gsi.ts            # dry run, prints counts
//   npx tsx scripts/backfill-engagement-gsi.ts --apply    # writes (needs dynamodb:Scan + dynamodb:UpdateItem)
//
// Uses the same env/table resolution as the app (APP_ENV, AWS creds from .env.local / environment).
import "dotenv/config";
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../lib/dynamodb";
import { TABLES } from "../lib/tableNames";
import { engagementSourceOf } from "../lib/engagementList";

const APPLY = process.argv.includes("--apply");

function toMs(v: any): number {
  if (typeof v === "number" && v > 0) return v;
  const t = new Date(v).getTime();
  return Number.isFinite(t) && t > 0 ? t : 0;
}

async function run(table: string, filter: string, values: Record<string, any>, keyOf: (it: any) => Record<string, any>) {
  let key: Record<string, any> | undefined;
  let seen = 0;
  let updated = 0;
  do {
    const page = await docClient.send(
      new ScanCommand({
        TableName: table,
        FilterExpression: `${filter} AND attribute_not_exists(engSource)`,
        ExpressionAttributeValues: values,
        ExclusiveStartKey: key,
      })
    );
    for (const it of page.Items || []) {
      seen++;
      const ts = toMs(it.createdAt) || toMs(it.updatedAt) || toMs(it.postingTime) || Date.now();
      if (!APPLY) continue;
      await docClient.send(
        new UpdateCommand({
          TableName: table,
          Key: keyOf(it),
          UpdateExpression: "SET engSource = :s, engCreatedAt = :t",
          ConditionExpression: "attribute_not_exists(engSource)",
          ExpressionAttributeValues: { ":s": engagementSourceOf(it), ":t": ts },
        })
      ).then(() => updated++).catch((e) => {
        if (e?.name !== "ConditionalCheckFailedException") throw e;
      });
    }
    key = page.LastEvaluatedKey;
  } while (key);
  console.log(`${table}: ${seen} rows need keys${APPLY ? `, ${updated} updated` : " (dry run)"}`);
}

(async () => {
  await run(
    TABLES.SocialAndContent,
    "begins_with(contentId, :p) AND sk = :m",
    { ":p": "ENGAGEMENT#", ":m": "ENGAGEMENT#META" },
    (it) => ({ contentId: it.contentId, sk: it.sk })
  );
  await run(
    TABLES.MatchMoments,
    "begins_with(sk, :p)",
    { ":p": "LOOP#" },
    (it) => ({ entityId: it.entityId, sk: it.sk })
  );
})();
