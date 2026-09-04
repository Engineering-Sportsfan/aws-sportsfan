import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { NextRequest } from "next/server";

export type ActivityAction = "login" | "logout" | "signup";

export interface LogUserActivityParams {
  req?: NextRequest | Request;
  email: string;
  userId?: string;
  userName?: string;
  action: ActivityAction;
  metadata?: Record<string, any>;
  ip?: string;
  location?: string;
  userAgent?: string;
  device?: string;
}

export interface UserActivityRecord {
  activityId: string;
  entityId: string;
  sk: string;
  userId: string;
  email: string;
  userName: string;
  action: ActivityAction;
  date: string; // YYYY-MM-DD
  time: string; // hh:mm:ss A
  timestamp: number;
  ip: string;
  location: string;
  userAgent: string;
  device: string;
  metadata?: Record<string, any>;
  createdAt: number;
}

/**
 * Parses user-agent header into a readable device string (e.g., "Chrome on Windows", "Safari on iOS", etc.)
 */
function parseDevice(userAgent: string): string {
  if (!userAgent || userAgent === "unknown") return "Unknown Device";

  let browser = "Browser";
  if (userAgent.includes("Edg/")) browser = "Edge";
  else if (userAgent.includes("Chrome/") && !userAgent.includes("Edg/")) browser = "Chrome";
  else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) browser = "Safari";
  else if (userAgent.includes("Firefox/")) browser = "Firefox";
  else if (userAgent.includes("PostmanRuntime")) browser = "Postman / API";
  else if (userAgent.includes("Mobile")) browser = "Mobile Browser";

  let os = "OS";
  if (userAgent.includes("Windows NT 10.0") || userAgent.includes("Windows NT 11.0")) os = "Windows";
  else if (userAgent.includes("Windows NT")) os = "Windows";
  else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
  else if (userAgent.includes("Mac OS X")) os = "macOS";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("Linux")) os = "Linux";

  return `${browser} on ${os}`;
}

/**
 * Extracts client IP from incoming request headers
 */
function extractIp(req?: NextRequest | Request): string {
  if (!req) return "127.0.0.1";
  const headers = req.headers;

  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-client-ip") ||
    headers.get("fastly-client-ip") ||
    "127.0.0.1"
  );
}

/**
 * Extracts location information from deployment headers (Vercel, Cloudflare, CloudFront, Amplify)
 */
function extractLocation(req?: NextRequest | Request, ip?: string): string {
  if (ip === "127.0.0.1" || ip === "::1" || ip?.startsWith("192.168.") || ip?.startsWith("10.") || ip === "localhost") {
    return "Localhost / Internal";
  }

  if (!req) return "Unknown Location";
  const headers = req.headers;

  const city =
    headers.get("x-vercel-ip-city") ||
    headers.get("cf-ipcity") ||
    headers.get("cloudfront-viewer-city") ||
    headers.get("x-city") ||
    "";

  const region =
    headers.get("x-vercel-ip-country-region") ||
    headers.get("cf-region") ||
    "";

  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("cloudfront-viewer-country-name") ||
    headers.get("x-country") ||
    "";

  const parts = [city, region, country].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(", ");
  }

  return "Global / Direct IP";
}

/**
 * Format timestamp into YYYY-MM-DD and hh:mm:ss A in standard local/IST timezone
 */
function formatDateAndTime(now: Date): { date: string; time: string } {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return { date: dateStr, time: timeStr };
}

/**
 * Logs a user activity (Login, Logout, Signup) date-wise in DynamoDB & Firestore.
 * Every single login creates an individual record with exact timestamp, IP, and location.
 */
export async function logUserActivity({
  req,
  email,
  userId,
  userName,
  action,
  metadata = {},
  ip: providedIp,
  location: providedLocation,
  userAgent: providedUserAgent,
  device: providedDevice,
}: LogUserActivityParams): Promise<UserActivityRecord> {
  const rawEmail = (email || "").trim().toLowerCase();
  const cleanEmail = rawEmail && rawEmail !== "unknown" ? rawEmail : (userId && userId !== "unknown" ? userId : "guest_session");
  const resolvedUserId = userId && userId !== "unknown" ? userId : cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
  const resolvedName = userName || (cleanEmail.includes("@") ? cleanEmail.split("@")[0] : "User");

  const now = new Date();
  const timestamp = now.getTime();
  const { date, time } = formatDateAndTime(now);

  const ip = providedIp || extractIp(req);
  const location = providedLocation || extractLocation(req, ip);
  const userAgent = providedUserAgent || (req ? req.headers.get("user-agent") || "unknown" : "unknown");
  const device = providedDevice || parseDevice(userAgent);

  const activityId = `ACT_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
  const entityId = `USER_ACTIVITY#${date}`;
  const sk = `SESSION#${timestamp}#${action.toUpperCase()}#${activityId}`;

  const record: UserActivityRecord = {
    activityId,
    entityId,
    sk,
    userId: resolvedUserId,
    email: cleanEmail,
    userName: resolvedName,
    action,
    date,
    time,
    timestamp,
    ip,
    location,
    userAgent,
    device,
    metadata,
    createdAt: timestamp,
  };

  // 1. Store in DynamoDB IdentityAndAccess
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.IdentityAndAccess,
        Item: record,
      })
    );
    console.log(`[User Activity] 📅 Stored ${action.toUpperCase()} for [${cleanEmail}] on ${date} ${time} | IP: ${ip} | Location: ${location}`);
  } catch (dynamoErr: any) {
    console.warn("DynamoDB user activity log notice:", dynamoErr?.message || dynamoErr);
  }

  // 2. Dual-Write to Firestore 'user_sessions'
  try {
    await db.collection(getFirestoreCollection("user_sessions")).doc(activityId).set(record);
  } catch (fbErr: any) {
    console.warn("Firebase user activity log notice:", fbErr?.message || fbErr);
  }

  return record;
}
