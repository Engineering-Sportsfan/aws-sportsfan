import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

function getClient() {
  const accessKeyId = process.env.CUSTOM_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CUSTOM_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;

  return new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    ...(credentials && { credentials }),
  });
}

const client = getClient();

export const dynamoClient = client;

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});


