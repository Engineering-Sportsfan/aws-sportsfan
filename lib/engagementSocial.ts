// lib/engagementSocial.ts — counts per-user LIKE# / SHARE# records for an engagement
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";

export async function countRecords(engagementId: string, prefix: "LIKE#" | "SHARE#") {
  let total = 0;
  let key: Record<string, any> | undefined;
  do {
    const r = await docClient.send(
      new QueryCommand({
        TableName: TABLES.SocialAndContent,
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `ENGAGEMENT#${engagementId}`, ":p": prefix },
        Select: "COUNT",
        ExclusiveStartKey: key,
      })
    );
    total += r.Count || 0;
    key = r.LastEvaluatedKey;
  } while (key);
  return total;
}