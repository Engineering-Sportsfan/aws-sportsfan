/**
 * setup_multisport_tables.ts
 *
 * Provisions the NEW multi-sport schema — 5 master tables + 1 transaction table —
 * per Multi_Sport_Full_Schema.docx. These are SEPARATE from the existing 6
 * SportsData/SocialAndContent/RealTimeChat/GamificationAndWallet/UserData/SystemAndConfig
 * master tables. Table names are prefixed "MS_" (Multi-Sport) so they can never collide
 * with the existing architecture.
 *
 * Run from aws-sportsfan repo root (same pattern as the existing
 * setup_dynamodb_tables.py / scratch/upload_data.ts tools):
 *
 *   npx tsx setup_multisport_tables.ts
 *
 * NOTE: unlike `next dev`, plain `npx tsx` does NOT auto-load .env.local —
 * that's why a bare run throws CredentialsProviderError even though the repo's
 * .env.local has the keys. We load it explicitly below via dotenv.
 *
 * Idempotent / safe to re-run — skips any table that already exists.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";

const REGION = process.env.AWS_REGION || "us-east-1";

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error(
    "Missing AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.\n" +
    "Check that .env.local exists in the repo root and has both keys set " +
    "(same file/keys the existing setup_dynamodb_tables.py uses)."
  );
  process.exit(1);
}

const client = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Table name -> key schema (+ optional GSIs)
const TABLES: Record<
  string,
  {
    pk: string;
    sk: string;
    gsis?: { indexName: string; pk: string; sk?: string }[];
  }
> = {
  // 1. Sports + Gender
  MS_Sports: { pk: "entityId", sk: "sk" },

  // 2. Level + Format (linked to Sport)
  MS_LevelFormat: { pk: "entityId", sk: "sk" },

  // 3. Nations/Clubs
  MS_Clubs: { pk: "entityId", sk: "sk" },

  // 4. Leagues/Federations
  MS_Leagues: { pk: "entityId", sk: "sk" },

  // 5. Players (universal fields only)
  MS_Players: { pk: "entityId", sk: "sk" },

  // 6. Transaction table — one row per player/team, per sport, per stint (or per
  // stats/record blob for a team). GSI1 = league->players lookup, GSI2 = club->players lookup,
  // matching the docx's GSI1PK/GSI2PK design.
  MS_Transactions: {
    pk: "entityId",
    sk: "sk",
    gsis: [
      { indexName: "GSI1", pk: "GSI1PK", sk: "sk" },
      { indexName: "GSI2", pk: "GSI2PK", sk: "sk" },
    ],
  },
};

async function tableExists(name: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return false;
    throw err;
  }
}

async function createTable(name: string, def: (typeof TABLES)[string]) {
  const attributeDefinitions: { AttributeName: string; AttributeType: "S" }[] = [
    { AttributeName: def.pk, AttributeType: "S" },
    { AttributeName: def.sk, AttributeType: "S" },
  ];
  const seen = new Set([def.pk, def.sk]);

  const globalSecondaryIndexes = def.gsis?.map((gsi) => {
    if (!seen.has(gsi.pk)) {
      attributeDefinitions.push({ AttributeName: gsi.pk, AttributeType: "S" });
      seen.add(gsi.pk);
    }
    return {
      IndexName: gsi.indexName,
      KeySchema: [
        { AttributeName: gsi.pk, KeyType: "HASH" as const },
        ...(gsi.sk ? [{ AttributeName: gsi.sk, KeyType: "RANGE" as const }] : []),
      ],
      Projection: { ProjectionType: "ALL" as const },
    };
  });

  await client.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: attributeDefinitions,
      KeySchema: [
        { AttributeName: def.pk, KeyType: "HASH" },
        { AttributeName: def.sk, KeyType: "RANGE" },
      ],
      ...(globalSecondaryIndexes ? { GlobalSecondaryIndexes: globalSecondaryIndexes } : {}),
    })
  );
  console.log(`  -> created ${name}`);
}

async function main() {
  console.log(`Provisioning multi-sport schema in region ${REGION}...\n`);
  for (const [name, def] of Object.entries(TABLES)) {
    if (await tableExists(name)) {
      console.log(`- ${name}: already exists, skipping`);
      continue;
    }
    console.log(`- ${name}: creating (PK=${def.pk}, SK=${def.sk}${def.gsis ? `, GSIs=${def.gsis.map((g) => g.indexName).join(",")}` : ""})`);
    await createTable(name, def);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("setup_multisport_tables.ts failed:", err);
  process.exit(1);
});