import { BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";

const BATCH_GET_LIMIT = 100; // DynamoDB BatchGetItem max keys per request
const MAX_RETRIES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * BatchGet many keys from one table, handling the 100-key request limit and
 * retrying UnprocessedKeys with exponential backoff (+ jitter).
 *
 * - Duplicate keys are removed first (DynamoDB rejects duplicates in one request).
 * - Chunks run in parallel.
 * - Throws if keys are still unprocessed after MAX_RETRIES, or on any request
 *   error, so callers keep their existing try/catch semantics.
 * - The docClient middleware resolves environment-suffixed table names.
 */
export async function batchGetItems(
  tableName: string,
  keys: Record<string, any>[],
  opts: {
    projectionExpression?: string;
    expressionAttributeNames?: Record<string, string>;
  } = {},
): Promise<Record<string, any>[]> {
  if (keys.length === 0) return [];

  const seen = new Set<string>();
  const uniqueKeys = keys.filter((k) => {
    const id = JSON.stringify(Object.entries(k).sort(([a], [b]) => (a < b ? -1 : 1)));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const chunks: Record<string, any>[][] = [];
  for (let i = 0; i < uniqueKeys.length; i += BATCH_GET_LIMIT) {
    chunks.push(uniqueKeys.slice(i, i + BATCH_GET_LIMIT));
  }

  const fetchChunk = async (chunk: Record<string, any>[]) => {
    const items: Record<string, any>[] = [];
    let pending: Record<string, any>[] = chunk;

    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt > MAX_RETRIES) {
        throw new Error(
          `BatchGet on ${tableName}: ${pending.length} key(s) still unprocessed after ${MAX_RETRIES} retries`,
        );
      }
      if (attempt > 0) {
        await sleep(Math.min(50 * 2 ** (attempt - 1), 800) + Math.random() * 25);
      }

      const res = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: pending,
              ...(opts.projectionExpression && { ProjectionExpression: opts.projectionExpression }),
              ...(opts.expressionAttributeNames && { ExpressionAttributeNames: opts.expressionAttributeNames }),
            },
          },
        }),
      );

      // Responses/UnprocessedKeys are keyed by the (resolved) table name; take whatever single entry is there.
      const responses = Object.values(res.Responses ?? {}).flat() as Record<string, any>[];
      items.push(...responses);

      const unprocessed = Object.values(res.UnprocessedKeys ?? {})[0]?.Keys;
      pending = (unprocessed as Record<string, any>[] | undefined) ?? [];
    }
    return items;
  };

  const results = await Promise.all(chunks.map(fetchChunk));
  return results.flat();
}
