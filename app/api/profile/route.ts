// app/api/profile/route.ts — Migrated to AWS DynamoDB (Single-Table Design)
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import cloudinary from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

function validateName(value: string): string | null {
  const v = value.trim();
  if (!v) return "Name is required.";
  if (v.length < 2) return "Name must be at least 2 characters.";
  if (v.length > 60) return "Name must be 60 characters or fewer.";
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-]+$/.test(v))
    return "Name must contain letters only (spaces, hyphens and apostrophes allowed).";
  return null;
}

function validateSubtitle(value: string): string | null {
  if (value.length > 160) return "Subtitle must be 160 characters or fewer.";
  return null;
}

function validateDescription(value: string): string | null {
  if (value.length > 500) return "Description must be 500 characters or fewer.";
  return null;
}

function validateLocation(value: string): string | null {
  if (value.length > 80) return "Location must be 80 characters or fewer.";
  return null;
}

function validateWebsite(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol))
      return "Website must start with http:// or https://.";
  } catch {
    return "Website must be a valid URL (e.g. https://example.com).";
  }
  if (value.length > 200) return "Website URL must be 200 characters or fewer.";
  return null;
}

async function getUser(req: NextRequest) {
  // Path A — httpOnly "token" cookie
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId = payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return { userId, email: payload.email, name: payload.name ?? "", role: payload.role ?? "user" };
      }
    } catch {
      // Expired / tampered — fall through to Bearer
    }
  }

  // Path B — Authorization header
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(bearerToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId = payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return { userId, email: payload.email, name: payload.name ?? "", role: payload.role ?? "user" };
      }
    } catch {
      // Invalid token
    }
  }

  return null;
}

// ── DynamoDB Profile Lookup Helper ───────────────────────────────────────────
async function fetchUserProfile(lookupId: string, email?: string): Promise<Record<string, unknown> | null> {
  // 1. Try Direct Lookup by entityId (USER#id)
  try {
    const directRes = await docClient.send(
      new GetCommand({
        TableName: "IdentityAndAccess",
        Key: {
          entityId: lookupId.startsWith("USER#") ? lookupId : `USER#${lookupId}`,
          sk: "USER#META",
        },
      })
    );
    if (directRes.Item) return directRes.Item as Record<string, unknown>;

    // Also check sk = "PROFILE" or sk = original doc id
    const profileRes = await docClient.send(
      new GetCommand({
        TableName: "IdentityAndAccess",
        Key: {
          entityId: lookupId.startsWith("USER#") ? lookupId : `USER#${lookupId}`,
          sk: "PROFILE",
        },
      })
    );
    if (profileRes.Item) return profileRes.Item as Record<string, unknown>;
  } catch (err) {
    console.warn("DynamoDB direct lookup notice:", err);
  }

  // 2. Try GSI Lookup by Email (if email is provided)
  if (email) {
    try {
      const emailRes = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          IndexName: "email-index",
          KeyConditionExpression: "email = :email",
          ExpressionAttributeValues: { ":email": email },
          Limit: 1,
        })
      );
      if (emailRes.Items && emailRes.Items.length > 0) {
        return emailRes.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn("DynamoDB GSI email-index lookup notice:", err);
    }
  }

  // 3. Fallback to Firebase during migration period (Zero-Downtime Guarantee)
  try {
    const fbDoc = await db.collection("users").doc(lookupId).get();
    if (fbDoc.exists) {
      return fbDoc.data() as Record<string, unknown>;
    }
    if (email) {
      const fbEmailDoc = await db.collection("users").doc(email).get();
      if (fbEmailDoc.exists) {
        return fbEmailDoc.data() as Record<string, unknown>;
      }
    }
  } catch (err) {
    console.warn("Firebase fallback notice:", err);
  }

  return null;
}

// ── GET: Read User Profile ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const authUser = await getUser(req);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const requestedUserId = req.nextUrl.searchParams.get("userId") ?? authUser.userId;
    const targetEmail = requestedUserId === authUser.userId ? authUser.email : undefined;

    const data = await fetchUserProfile(requestedUserId, targetEmail);

    if (!data) {
      return NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
    }

    const payload = {
      name: data.name ?? null,
      subtitle: data.subtitle ?? null,
      description: data.description ?? null,
      location: data.location ?? null,
      website: data.website ?? null,
      avatarUrl: data.avatarUrl ?? null,
      joinedDate: data.joinedDate ?? null,
      role: data.role ?? null,
      followers: data.followers ?? 0,
      following: data.following ?? 0,
      connections: data.connections ?? null,
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST: Update User Profile ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const authUser = await getUser(req);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const formData = await req.formData();
    const name = formData.get("name");
    const subtitle = formData.get("subtitle");
    const description = formData.get("description");
    const location = formData.get("location");
    const website = formData.get("website");
    const profilePicture = formData.get("profilePicture") as File | null;

    const validationErrors: Record<string, string> = {};

    if (name !== null && name !== undefined) {
      const err = validateName(String(name));
      if (err) validationErrors.name = err;
    }
    if (subtitle !== null && subtitle !== undefined) {
      const err = validateSubtitle(String(subtitle));
      if (err) validationErrors.subtitle = err;
    }
    if (description !== null && description !== undefined) {
      const err = validateDescription(String(description));
      if (err) validationErrors.description = err;
    }
    if (location !== null && location !== undefined) {
      const err = validateLocation(String(location));
      if (err) validationErrors.location = err;
    }
    if (website !== null && website !== undefined) {
      const err = validateWebsite(String(website));
      if (err) validationErrors.website = err;
    }

    if (Object.keys(validationErrors).length > 0) {
      return NextResponse.json(
        { error: "Validation failed", fields: validationErrors },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ── Build update payload ─────────────────────────────────────────────────
    const updateData: Record<string, unknown> = {};

    if (profilePicture && profilePicture.size > 0) {
      const bytes = await profilePicture.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${profilePicture.type};base64,${buffer.toString("base64")}`;

      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "profile-images",
      });

      updateData.avatarUrl = uploadRes.secure_url;
    }

    if (name !== null && name !== undefined) updateData.name = String(name).trim().slice(0, 60);
    if (subtitle !== null && subtitle !== undefined) updateData.subtitle = String(subtitle).trim().slice(0, 160);
    if (description !== null && description !== undefined) updateData.description = String(description).trim().slice(0, 500);
    if (location !== null && location !== undefined) updateData.location = String(location).trim().slice(0, 80);
    if (website !== null && website !== undefined) updateData.website = String(website).trim().slice(0, 200);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ── Timestamps & Identifiers ─────────────────────────────────────────────
    const now = Date.now();
    updateData.updatedAt = now;

    // Check if user already exists
    const existing = await fetchUserProfile(authUser.userId, authUser.email);
    if (!existing) {
      updateData.email = authUser.email;
      updateData.userId = authUser.userId;
      updateData.createdAt = now;
      updateData.joinedDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      updateData.role = authUser.role ?? "user";
      updateData.followers = 0;
      updateData.following = 0;
    }

    // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
    const primaryKeyId = authUser.userId || authUser.email;
    const dynamoItem = {
      entityId: `USER#${primaryKeyId}`,
      sk: "USER#META",
      email: authUser.email,
      ...existing,
      ...updateData,
    };

    await dualWrite("users", primaryKeyId, "IdentityAndAccess", dynamoItem);

    return NextResponse.json(
      {
        success: true,
        updatedFields: Object.keys(updateData).filter(
          (k) => !["updatedAt", "createdAt", "joinedDate", "role", "email", "userId"].includes(k)
        ),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}