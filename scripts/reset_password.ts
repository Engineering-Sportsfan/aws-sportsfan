import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function reset() {
  const newPassword = "password123";
  const hash = await bcrypt.hash(newPassword, 12);
  
  await docClient.send(new UpdateCommand({
    TableName: "AdminUsers",
    Key: { email: "testadmin@sf360.com" },
    UpdateExpression: "set password = :p",
    ExpressionAttributeValues: { ":p": hash }
  }));
  console.log("Password reset to: " + newPassword);
}
reset();
