// quick standalone check — run this locally (not here, no AWS creds in sandbox)
// npx tsx check_athlete.mjs  (or node if compiled)
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.SPORTS_DATA_TABLE || "SportsData";

const res = await ddb.send(new GetCommand({
  TableName: TABLE,
  Key: { entityId: "ATHLETE#mohammed_ashfaq", sk: "PROFILE#META" },
}));

console.log("GetItem result:", res.Item ?? "NOT FOUND");

// fallback: scan for anything close, in case the id/case differs
const scan = await ddb.send(new ScanCommand({
  TableName: TABLE,
  FilterExpression: "contains(entityId, :id)",
  ExpressionAttributeValues: { ":id": "ashfaq" },
}));
console.log("Scan matches containing 'ashfaq':", scan.Items);
