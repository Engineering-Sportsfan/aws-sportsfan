// scripts/create_match_moments_table.js
// Provisions the MatchMoments tables in AWS DynamoDB (MatchMoments-dev, MatchMoments-release, MatchMoments)
const fs = require('fs');
const path = require('path');

// 1. Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const accessKeyId = process.env.CUSTOM_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.CUSTOM_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || 'us-east-1';

if (!accessKeyId || !secretAccessKey) {
  console.error('❌ AWS credentials not found in .env.local (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)');
  process.exit(1);
}

const client = new DynamoDBClient({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

// Tables to create across environments
const targetTables = ['MatchMoments-dev', 'MatchMoments-release', 'MatchMoments'];

async function createTableIfNotExists(tableName) {
  console.log(`\n🔍 Checking table: "${tableName}" in region "${region}"...`);

  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`✅ Table "${tableName}" already exists (Status: ${desc.Table.TableStatus})`);
    return;
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') {
      console.error(`⚠️ Error checking "${tableName}":`, err.message);
      return;
    }
  }

  console.log(`🚀 Table "${tableName}" does not exist. Creating now with PartitionKey="entityId" and SortKey="sk"...`);

  const params = {
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'entityId', KeyType: 'HASH' },  // Partition Key
      { AttributeName: 'sk', KeyType: 'RANGE' },       // Sort Key
    ],
    AttributeDefinitions: [
      { AttributeName: 'entityId', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST', // On-demand scaling
  };

  try {
    const createRes = await client.send(new CreateTableCommand(params));
    console.log(`🎉 Table "${tableName}" creation initiated successfully! (Status: ${createRes.TableDescription.TableStatus})`);
  } catch (createErr) {
    console.error(`❌ Failed to create table "${tableName}":`, createErr.message);
  }
}

async function run() {
  console.log('====================================================');
  console.log('  PROVISIONING DYNAMODB TABLES FOR MATCH MOMENTS');
  console.log('====================================================');
  for (const tbl of targetTables) {
    await createTableIfNotExists(tbl);
  }
  console.log('\n✨ Finished provisioning MatchMoments tables.');
}

run();

