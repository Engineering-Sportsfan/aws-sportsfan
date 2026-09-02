// lib/logAuthIssue.ts — Real-time logging of login, signup, and OTP issues to DynamoDB & Firebase
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES } from "@/lib/tableNames";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

export type AuthIssueType = "login" | "signup" | "otp";

export interface LogAuthIssueParams {
  email: string;
  type: AuthIssueType;
  reason: string;
  endpoint: string;
  ip?: string;
  metadata?: Record<string, any>;
}

export async function logAuthIssue({
  email,
  type,
  reason,
  endpoint,
  ip,
  metadata = {},
}: LogAuthIssueParams): Promise<void> {
  const cleanEmail = (email || "unknown").trim().toLowerCase();
  const timestamp = Date.now();
  const issueId = `ISSUE_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;

  const issueRecord = {
    issueId,
    email: cleanEmail,
    type,
    reason,
    endpoint,
    ip: ip || "unknown",
    status: "pending", // "pending" | "resolved"
    timestamp,
    metadata,
    createdAt: timestamp,
  };

  // 1. Save to DynamoDB IdentityAndAccess
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.IdentityAndAccess,
        Item: {
          entityId: `AUTH_ISSUE#${timestamp}#${cleanEmail}`,
          sk: `ISSUE#${type.toUpperCase()}#${issueId}`,
          ...issueRecord,
        },
      })
    );
    console.log(`[Auth Monitoring] ⚠️ LOGGED ${type.toUpperCase()} ISSUE for [${cleanEmail}]: ${reason}`);
  } catch (dynamoErr: any) {
    console.warn("DynamoDB auth issue logging notice:", dynamoErr?.message || dynamoErr);
  }

  // 2. Dual-write to Firebase 'auth_issues'
  try {
    await db.collection("auth_issues").doc(issueId).set(issueRecord);
  } catch (fbErr: any) {
    console.warn("Firebase auth issue logging notice:", fbErr?.message || fbErr);
  }
}
