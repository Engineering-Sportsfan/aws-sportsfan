import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { getFirestoreCollection } from "@/lib/tableNames";
import { PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export interface DualWriteOptions {
  tableName?: string;
  dynamoTableName?: string;
  dynamoItem: any;
  firestoreRef?: any;
  firestoreData?: any;
  collectionName?: string;
  docId?: string;
}

export interface DualDeleteOptions {
  tableName?: string;
  dynamoTableName?: string;
  key?: Record<string, any>;
  collectionName?: string;
  docId?: string;
  firestoreRef?: any;
}

/**
 * dualWrite: The Safety Net
 * Writes data to both Firebase and AWS DynamoDB simultaneously.
 * Supports both object options and 4-argument positional signatures.
 */
/**
 * Generates candidate table names to gracefully handle environment-suffixed tables
 * (e.g. SocialAndContent-dev, SocialAndContent, SocialAndContent-develop, SocialAndContent-release).
 */
export function getCandidateTableNames(tableName?: string): string[] {
  if (!tableName) return [];
  const baseName = tableName.replace(/-(dev|develop|release|prod|staging|test)$/i, "");
  return Array.from(
    new Set([
      tableName,
      baseName,
      `${baseName}-dev`,
      `${baseName}-develop`,
      `${baseName}-release`,
      `${baseName}-prod`,
    ])
  );
}

/**
 * dualWrite: The Safety Net
 * Writes data to both Firebase and AWS DynamoDB simultaneously.
 * Supports both object options and 4-argument positional signatures.
 * Automatically tries candidate table names if environment suffixes differ in AWS.
 */
export async function dualWrite(
  optionsOrCollection: string | DualWriteOptions,
  docId?: string,
  dynamoTableName?: string,
  dynamoItem?: any
) {
  let dynamoSuccess = false;
  let firestoreSuccess = false;
  let lastDynamoError: any = null;

  try {
    let tableName: string;
    let item: any;
    let firestoreRef: any = null;
    let firestoreData: any = null;
    let collectionName: string | undefined;
    let documentId: string | undefined;

    if (typeof optionsOrCollection === "object" && optionsOrCollection !== null) {
      tableName = (optionsOrCollection.dynamoTableName || optionsOrCollection.tableName)!;
      item = optionsOrCollection.dynamoItem;
      firestoreRef = optionsOrCollection.firestoreRef;
      firestoreData = optionsOrCollection.firestoreData;
      collectionName = optionsOrCollection.collectionName;
      documentId = optionsOrCollection.docId;
    } else {
      collectionName = optionsOrCollection;
      documentId = docId;
      tableName = dynamoTableName!;
      item = dynamoItem;
    }

    // 1. Write to DynamoDB (Primary with candidate table fallback)
    if (tableName && item) {
      const candidateTables = getCandidateTableNames(tableName);
      for (const candidate of candidateTables) {
        try {
          await docClient.send(
            new PutCommand({
              TableName: candidate,
              Item: item,
            })
          );
          dynamoSuccess = true;
          break;
        } catch (dynErr: any) {
          lastDynamoError = dynErr;
          const isTableMissing =
            dynErr?.name === "ResourceNotFoundException" ||
            dynErr?.message?.includes("Cannot do operations on a non-existent table") ||
            dynErr?.message?.includes("ResourceNotFoundException");

          if (isTableMissing) {
            continue; // Try next candidate table
          } else {
            console.warn(`[dualWrite] DynamoDB write error on table "${candidate}":`, dynErr?.message || dynErr);
            break;
          }
        }
      }

      if (!dynamoSuccess && lastDynamoError) {
        console.warn(
          `[dualWrite] ⚠️ DynamoDB write was unable to match active table among [${candidateTables.join(", ")}]:`,
          lastDynamoError?.message || lastDynamoError
        );
      }
    }

    // 2. Write to Firebase (Fallback/Sync — non-blocking so Firestore issues never fail DynamoDB)
    try {
      if (firestoreRef) {
        await firestoreRef.set(firestoreData || item, { merge: true });
        firestoreSuccess = true;
      } else if (collectionName && documentId) {
        const firebaseData = { ...(firestoreData || item) };
        delete firebaseData.entityId; // Clean up AWS-specific keys
        delete firebaseData.sk;
        delete firebaseData.GSI1PK;
        delete firebaseData.GSI1SK;

        const targetCollection = getFirestoreCollection(collectionName);
        if (db) {
          await db.collection(targetCollection).doc(documentId).set(firebaseData, { merge: true });
          firestoreSuccess = true;
        }
      }
    } catch (fbErr: any) {
      console.warn(`[dualWrite] ⚠️ Firebase sync skipped/failed (Firestore inactive):`, fbErr?.message || fbErr);
    }

    // If neither DynamoDB nor Firestore succeeded, throw last DynamoDB error
    if (!dynamoSuccess && !firestoreSuccess && lastDynamoError) {
      throw lastDynamoError;
    }

    return true;
  } catch (error) {
    console.error(`❌ Dual-Write failed:`, error);
    throw error;
  }
}

/**
 * dualDelete: The Safety Net for deletions
 * Deletes data from both Firebase and AWS DynamoDB simultaneously.
 * Supports both object options and 4-argument positional signatures.
 */
export async function dualDelete(
  optionsOrCollection: string | DualDeleteOptions,
  docId?: string,
  dynamoTableName?: string,
  key?: Record<string, any>
) {
  try {
    let tableName: string | undefined;
    let deleteKey: Record<string, any> | undefined;
    let firestoreRef: any = null;
    let collectionName: string | undefined;
    let documentId: string | undefined;

    if (typeof optionsOrCollection === "object" && optionsOrCollection !== null) {
      tableName = optionsOrCollection.dynamoTableName || optionsOrCollection.tableName;
      deleteKey = optionsOrCollection.key;
      firestoreRef = optionsOrCollection.firestoreRef;
      collectionName = optionsOrCollection.collectionName;
      documentId = optionsOrCollection.docId;
    } else {
      collectionName = optionsOrCollection;
      documentId = docId;
      tableName = dynamoTableName;
      deleteKey = key;
    }

    // 1. Delete from DynamoDB (with candidate table fallback)
    if (tableName && deleteKey) {
      const candidateTables = getCandidateTableNames(tableName);
      for (const candidate of candidateTables) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: candidate,
              Key: deleteKey,
            })
          );
          break;
        } catch (dynErr: any) {
          const isTableMissing =
            dynErr?.name === "ResourceNotFoundException" ||
            dynErr?.message?.includes("Cannot do operations on a non-existent table") ||
            dynErr?.message?.includes("ResourceNotFoundException");
          if (isTableMissing) continue;
          break;
        }
      }
    }

    // 2. Delete from Firebase (Fallback/Sync — non-blocking)
    try {
      if (firestoreRef) {
        await firestoreRef.delete();
      } else if (collectionName && documentId) {
        const targetCollection = getFirestoreCollection(collectionName);
        if (db) {
          await db.collection(targetCollection).doc(documentId).delete();
        }
      }
    } catch (fbErr: any) {
      console.warn(`[dualDelete] ⚠️ Firebase delete skipped/failed:`, fbErr?.message || fbErr);
    }

    return true;
  } catch (error) {
    console.error(`❌ Dual-Delete failed in DynamoDB:`, error);
    throw error;
  }
}
