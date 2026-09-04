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
export async function dualWrite(
  optionsOrCollection: string | DualWriteOptions,
  docId?: string,
  dynamoTableName?: string,
  dynamoItem?: any
) {
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

    // 1. Write to DynamoDB (Primary)
    if (tableName && item) {
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        })
      );
    }

    // 2. Write to Firebase (Fallback/Sync)
    if (firestoreRef) {
      await firestoreRef.set(firestoreData || item, { merge: true });
    } else if (collectionName && documentId) {
      const firebaseData = { ...(firestoreData || item) };
      delete firebaseData.entityId; // Clean up AWS-specific keys
      delete firebaseData.sk;
      delete firebaseData.GSI1PK;
      delete firebaseData.GSI1SK;

      const targetCollection = getFirestoreCollection(collectionName);
      await db.collection(targetCollection).doc(documentId).set(firebaseData, { merge: true });
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

    // 1. Delete from DynamoDB
    if (tableName && deleteKey) {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: deleteKey,
        })
      );
    }

    // 2. Delete from Firebase
    if (firestoreRef) {
      await firestoreRef.delete();
    } else if (collectionName && documentId) {
      const targetCollection = getFirestoreCollection(collectionName);
      await db.collection(targetCollection).doc(documentId).delete();
    }

    return true;
  } catch (error) {
    console.error(`❌ Dual-Delete failed:`, error);
    throw error;
  }
}
