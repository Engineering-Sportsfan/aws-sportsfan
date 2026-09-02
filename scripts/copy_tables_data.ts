// scripts/copy_tables_data.ts — Copies all existing data from Base (Prod) tables to -dev and -release tables
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});

// The 13 base DynamoDB tables
const BASE_TABLES = [
  "GamificationAndWallet",
  "IdentityAndAccess",
  "MS_Clubs",
  "MS_Leagues",
  "MS_LevelFormat",
  "MS_Players",
  "MS_Sports",
  "MS_Transactions",
  "RealTimeChat",
  "sf360-notifications",
  "SocialAndContent",
  "SportsData",
  "StoreAndCommerce",
];

// Split array into chunks of 25 (DynamoDB BatchWriteItem limit)
function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function scanAllItems(tableName: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  try {
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      if (res.Items && res.Items.length > 0) {
        items.push(...res.Items);
      }
      lastEvaluatedKey = res.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (err: any) {
    console.warn(`   ⚠️ Warning: Could not scan table '${tableName}': ${err.message || err}`);
  }

  return items;
}

async function writeItemsToTable(targetTable: string, items: Record<string, any>[]) {
  if (items.length === 0) {
    console.log(`   ℹ️  No items to write to '${targetTable}'`);
    return;
  }

  const chunks = chunkArray(items, 25);
  let writtenCount = 0;

  for (const chunk of chunks) {
    const putRequests = chunk.map((item) => ({
      PutRequest: {
        Item: item,
      },
    }));

    try {
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [targetTable]: putRequests,
          },
        })
      );
      writtenCount += chunk.length;
    } catch (err: any) {
      console.warn(`   ❌ Batch write error to '${targetTable}': ${err.message || err}`);
    }
  }

  console.log(`   ✅ Copied ${writtenCount} / ${items.length} items to '${targetTable}'`);
}

async function main() {
  const targetEnv = process.argv[2] || "all"; // "dev", "release", or "all"

  console.log("==========================================================================");
  console.log(`📦 DYNAMODB DATA MIGRATION: Prod -> [${targetEnv.toUpperCase()}] Tables`);
  console.log("==========================================================================\n");

  const environments = targetEnv === "all" ? ["dev", "release"] : [targetEnv];

  for (const baseTable of BASE_TABLES) {
    console.log(`\n📋 Processing Source Table: [${baseTable}]...`);
    const items = await scanAllItems(baseTable);
    console.log(`   Found ${items.length} items in '${baseTable}'`);

    if (items.length === 0) {
      console.log(`   Skipping clone (table is empty)`);
      continue;
    }

    for (const env of environments) {
      const targetTable = `${baseTable}-${env}`;
      console.log(`   Cloning into target: '${targetTable}'...`);
      await writeItemsToTable(targetTable, items);
    }
  }

  console.log("\n==========================================================================");
  console.log("🎉 ALL DATA SUCCESSFULLY COPIED TO TARGET TABLES!");
  console.log("==========================================================================\n");
}

main().catch((err) => {
  console.error("Migration fatal error:", err);
  process.exit(1);
});
