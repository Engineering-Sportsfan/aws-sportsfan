import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const credentials = process.env.CUSTOM_AWS_ACCESS_KEY_ID && process.env.CUSTOM_AWS_SECRET_ACCESS_KEY 
  ? {
      accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY,
    }
  : undefined;

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  ...(credentials && { credentials }),
});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});
