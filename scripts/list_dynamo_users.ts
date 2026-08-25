import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  }
});

async function listAllDynamoUsers() {
  console.log("======================================================================");
  console.log("👥 FETCHING ALL USERS FROM AWS DYNAMODB (IdentityAndAccess Table)");
  console.log("======================================================================\n");

  let allUsers: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  try {
    do {
      const res: any = await docClient.send(new ScanCommand({
        TableName: "IdentityAndAccess",
        FilterExpression: "begins_with(entityId, :prefix) AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":prefix": "USER#",
          ":skPrefix": "USER#"
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }));

      if (res.Items && res.Items.length > 0) {
        allUsers.push(...res.Items);
      }
      lastEvaluatedKey = res.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (err: any) {
    console.error("❌ Failed to scan DynamoDB IdentityAndAccess:", err.message);
    process.exit(1);
  }

  console.log(`📊 TOTAL ACTIVE USERS IN DYNAMODB: ${allUsers.length}\n`);

  if (allUsers.length === 0) {
    console.log("ℹ️ No users found in DynamoDB IdentityAndAccess.");
    console.log("======================================================================");
    return;
  }

  // Format table output
  console.log("-------------------------------------------------------------------------------------------------------------------------");
  console.log(
    `#`.padEnd(4) +
    `EMAIL`.padEnd(38) +
    `USER ID`.padEnd(38) +
    `NAME`.padEnd(24) +
    `ROLE`.padEnd(10) +
    `VERIFIED`
  );
  console.log("-------------------------------------------------------------------------------------------------------------------------");

  allUsers.forEach((u, i) => {
    const email = u.email || String(u.entityId || "").replace(/^USER#/, "");
    const userId = u.userId || "N/A";
    const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || "N/A";
    const role = u.role || "user";
    const isVerified = u.isVerified ? "✅ Yes" : "❌ No";

    console.log(
      `${(i + 1).toString().padEnd(4)}` +
      `${email.slice(0, 36).padEnd(38)}` +
      `${userId.slice(0, 36).padEnd(38)}` +
      `${name.slice(0, 22).padEnd(24)}` +
      `${role.padEnd(10)}` +
      `${isVerified}`
    );
  });

  console.log("-------------------------------------------------------------------------------------------------------------------------");
  console.log(`\n🎉 Scan complete. Total users: ${allUsers.length}`);
  console.log("======================================================================\n");
}

listAllDynamoUsers();
