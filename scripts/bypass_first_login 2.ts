import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function update() {
  await docClient.send(new UpdateCommand({
    TableName: "AdminUsers",
    Key: { email: "testadmin@sf360.com" },
    UpdateExpression: "set isFirstLogin = :f",
    ExpressionAttributeValues: { ":f": false }
  }));
  console.log("isFirstLogin set to false");
}
update();
