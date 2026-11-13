const fs = require('fs');
const path = require('path');

function parseEnv(p) {
  if (!fs.existsSync(p)) return {};
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const env = { ...parseEnv(path.join(__dirname, '.env')), ...parseEnv(path.join(__dirname, '.env.local')) };
const { DynamoDBClient } = require(path.join(__dirname, 'node_modules/@aws-sdk/client-dynamodb'));
const { DynamoDBDocumentClient, ScanCommand } = require(path.join(__dirname, 'node_modules/@aws-sdk/lib-dynamodb'));

const client = new DynamoDBClient({
  region: env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  }
});
const ddb = DynamoDBDocumentClient.from(client);

async function check() {
  const tables = ['SocialAndContent-dev', 'SocialAndContent', 'MatchMoments-dev'];
  for (const t of tables) {
    try {
      const res = await ddb.send(new ScanCommand({
        TableName: t,
        FilterExpression: '#tp = :tp',
        ExpressionAttributeNames: { '#tp': 'type' },
        ExpressionAttributeValues: { ':tp': 'match_result' }
      }));
      if (res.Items && res.Items.length > 0) {
        console.log(`FOUND ${res.Items.length} in ${t}:`, JSON.stringify(res.Items, null, 2));
      } else {
        console.log(`No match_result in ${t}`);
      }
    } catch (e) {
      console.log(`Error in ${t}:`, e.message);
    }
  }
}
check();
