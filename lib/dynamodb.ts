import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getTableName } from "./tableNames";

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

function resolveCommandTableNames(input: any) {
  if (!input) return;
  if (typeof input.TableName === "string") {
    input.TableName = getTableName(input.TableName);
  }
  if (input.RequestItems && typeof input.RequestItems === "object") {
    const rewritten: Record<string, any> = {};
    for (const [tbl, conf] of Object.entries(input.RequestItems)) {
      rewritten[getTableName(tbl)] = conf;
    }
    input.RequestItems = rewritten;
  }
  if (Array.isArray(input.TransactItems)) {
    for (const item of input.TransactItems) {
      for (const op of ["Put", "Update", "Delete", "Get", "ConditionCheck"]) {
        if (item[op]?.TableName) {
          item[op].TableName = getTableName(item[op].TableName);
        }
      }
    }
  }
}

// Automatically resolve environment-suffixed table names (dev, release, prod) for all DynamoDB commands
docClient.middlewareStack.add(
  (next) => async (args: any) => {
    resolveCommandTableNames(args.input);
    return next(args);
  },
  {
    step: "initialize",
    name: "resolve3EnvTableNameMiddleware",
    override: true,
  }
);


