// app/api/invite-waitlist/route.ts — Stores RSVP Waitlist user registrations in the 'userwaitinglist' DynamoDB table
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient, dynamoClient } from "@/lib/dynamodb";
import { TABLES, getTableName } from "@/lib/tableNames";
import { PutCommand, ScanCommand, GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";
import { transporter } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export interface UserWaitingListRecord {
  id: string;
  name: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  phone: string;
  location: string;
  institution?: string;
  university?: string;
  referBy?: string;
  referredBy?: string;
  timestamp: string;
  createdAt: number;
  eventName?: string;
  status?: string;
  userAgent?: string;
}

// Table name resolution
const TABLE_NAME = (TABLES as Record<string, string>)["userwaitinglist"] || "userwaitinglist";

// CORS: the RSVP form is hosted as static HTML on sportsfan360.com, while this
// API route lives on a separate deployment — every response (including the
// preflight) needs these headers or the browser blocks the request.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://sportsfan360.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      fullName,
      email,
      phone,
      phoneNumber,
      location,
      institution,
      university,
      referBy,
      referredBy,
      timestamp,
    } = body || {};

    const resolvedName = (name || fullName || "").toString().trim();
    const resolvedEmail = (email || "").toString().trim().toLowerCase();
    const resolvedPhone = (phone || phoneNumber || "").toString().trim();
    const resolvedLocation = (location || "").toString().trim();
    const resolvedInstitution = (institution || university || "").toString().trim();
    const resolvedReferBy = (referBy || referredBy || "").toString().trim();
    const fillTimestamp = timestamp ? timestamp.toString() : new Date().toISOString();

    if (!resolvedName) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!resolvedEmail || !resolvedEmail.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid Email ID is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!resolvedPhone) {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!resolvedLocation) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const id = randomUUID();
    const now = Date.now();

    const record: UserWaitingListRecord = {
      id,
      name: resolvedName,
      fullName: resolvedName,
      email: resolvedEmail,
      phoneNumber: resolvedPhone,
      phone: resolvedPhone,
      location: resolvedLocation,
      institution: resolvedInstitution || undefined,
      university: resolvedInstitution || undefined,
      referBy: resolvedReferBy || undefined,
      referredBy: resolvedReferBy || undefined,
      timestamp: fillTimestamp,
      createdAt: now,
      eventName: "SportsFan360 Event",
      status: "waitlisted",
      userAgent: req.headers.get("user-agent") || undefined,
    };

    // 1. Primary write to AWS DynamoDB 'userwaitinglist' table
    let dynamoSuccess = false;
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: record,
        })
      );
      dynamoSuccess = true;
      console.log(`✅ [DynamoDB: ${TABLE_NAME}] Successfully saved user: ${resolvedEmail} (${id})`);
    } catch (dynErr: any) {
      console.warn(`⚠️ [DynamoDB: ${TABLE_NAME}] Error writing item:`, dynErr?.name, dynErr?.message || dynErr);

      // If the table doesn't exist yet in AWS DynamoDB, automatically trigger table creation
      if (
        dynErr?.name === "ResourceNotFoundException" ||
        dynErr?.message?.includes("Cannot do operations on a non-existent table") ||
        dynErr?.message?.includes("ResourceNotFoundException")
      ) {
        try {
          console.log(`⚙️ Table "${TABLE_NAME}" not found in AWS DynamoDB. Creating it now...`);
          await dynamoClient.send(
            new CreateTableCommand({
              TableName: TABLE_NAME,
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
              BillingMode: "PAY_PER_REQUEST",
            })
          );
          console.log(`🎉 [DynamoDB] Created table "${TABLE_NAME}" successfully in AWS!`);
        } catch (createErr: any) {
          if (createErr?.name !== "ResourceInUseException") {
            console.error(`❌ [DynamoDB] Failed to create table "${TABLE_NAME}":`, createErr?.message || createErr);
          }
        }
      }

      // Secondary fallback write to IdentityAndAccess
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLES.IdentityAndAccess || "IdentityAndAccess",
            Item: {
              entityId: `WAITLIST#${id}`,
              sk: `USER#${resolvedEmail}`,
              ...record,
            },
          })
        );
        dynamoSuccess = true;
        console.log(`✅ [DynamoDB: IdentityAndAccess] Saved backup record for: ${resolvedEmail}`);
      } catch (fallbackErr) {
        console.warn("⚠️ [DynamoDB fallback] Notice:", fallbackErr);
      }
    }

    // 2. Dual-Write to Firestore ('userwaitinglist' collection) as additional sync/backup
    if (db) {
      try {
        await db.collection("userwaitinglist").doc(id).set(record, { merge: true });
        console.log(`✅ [Firestore: userwaitinglist] Synced doc: ${id}`);
      } catch (fsErr) {
        console.warn("⚠️ [Firestore: userwaitinglist] Notice:", fsErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "User successfully registered on waiting list!",
        user: {
          id,
          name: resolvedName,
          email: resolvedEmail,
          phoneNumber: resolvedPhone,
          location: resolvedLocation,
          institution: resolvedInstitution,
          referBy: resolvedReferBy,
          timestamp: fillTimestamp,
        },
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: unknown) {
    console.error("Error in POST /api/invite-waitlist:", error);
    const message = error instanceof Error ? error.message : "Failed to register user to waiting list";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 500;
    const id = searchParams.get("id");

    // Single user lookup
    if (id) {
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { id },
          })
        );
        if (getRes.Item) {
          return NextResponse.json({
            success: true,
            user: getRes.Item,
          });
        }
      } catch (e) {
        console.warn(`[userwaitinglist GET id] DynamoDB notice:`, e);
      }

      if (db) {
        const doc = await db.collection("userwaitinglist").doc(id).get();
        if (doc.exists) {
          return NextResponse.json({
            success: true,
            user: { id: doc.id, ...doc.data() },
          });
        }
      }

      return NextResponse.json({ success: false, error: "User not found in waiting list" }, { status: 404 });
    }

    // List all users from 'userwaitinglist' (with pagination loop for full directory)
    let users: any[] = [];
    try {
      let ExclusiveStartKey: Record<string, any> | undefined;
      do {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            Limit: Math.min(limit, 250),
            ExclusiveStartKey,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          users.push(...scanRes.Items);
        }
        ExclusiveStartKey = scanRes.LastEvaluatedKey;
        if (users.length >= limit) break;
      } while (ExclusiveStartKey);
    } catch (e) {
      console.warn(`[userwaitinglist GET list] DynamoDB notice:`, e);
    }

    // Fallback to Firestore if needed
    if (users.length === 0 && db) {
      const snap = await db.collection("userwaitinglist").orderBy("createdAt", "desc").limit(limit).get();
      users = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json(
      {
        success: true,
        count: users.length,
        users,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch waiting list";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing record ID" }, { status: 400 });
    }

    // 1. Delete from DynamoDB userwaitinglist
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id },
        })
      );
    } catch (dynErr) {
      console.warn("[invite-waitlist DELETE] DynamoDB notice:", dynErr);
    }

    // 2. Also delete from Firestore if exists
    if (db) {
      try {
        await db.collection("userwaitinglist").doc(id).delete();
      } catch (fsErr) {
        console.warn("[invite-waitlist DELETE] Firestore notice:", fsErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Waitlist record deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete waitlist record";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function generateFlipLiveInviteEmail(name: string) {
  const appUrl = "https://app.sportsfan360.com/";
  const text = `Hi ${name},

You are invited to join Flip LIVE on SportsFan360!

Get ready for the ultimate interactive live sports experience. Connect in real-time with creators and fellow sports fans, participate in live match watch-alongs, engage in fan battles, predict live match outcomes, and earn rewards alongside fellow superfans.

Join Flip LIVE now using the link below:
${appUrl}

Welcome to the stadium!
The SportsFan360 & Flip LIVE Team`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to Flip LIVE!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0e14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e6edf3;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0e14; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #161b22; border-radius: 16px; border: 1px solid #30363d; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
          
          <!-- Banner / Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #7928ca 0%, #ff0080 50%, #ff4d4d 100%); padding: 36px 30px; text-align: center;">
              <div style="font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.4);">
                🔥 Flip LIVE
              </div>
              <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.9); margin-top: 6px;">
                by SportsFan360
              </div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                Hi ${name},
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #c9d1d9;">
                Great news! Your waitlist request has been approved. You are officially invited to join <strong style="color: #ffffff;">Flip LIVE</strong> — the next-generation interactive live sports experience.
              </p>

              <!-- Highlights Card -->
              <div style="background-color: #0d1117; border: 1px solid #21262d; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #58a6ff; margin-bottom: 12px;">
                  What awaits you inside Flip LIVE:
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #c9d1d9; line-height: 1.6;">
                  <tr>
                    <td style="padding-bottom: 10px; vertical-align: top; width: 24px;">🏟️</td>
                    <td style="padding-bottom: 10px;">
                      <strong style="color: #ffffff;">Interactive Watch-Along Rooms:</strong> Stream and banter live with fellow superfans and verified hosts.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 10px; vertical-align: top; width: 24px;">⚔️</td>
                    <td style="padding-bottom: 10px;">
                      <strong style="color: #ffffff;">Fan Battles & Predictions:</strong> Prove your sports knowledge, predict key match moments, and top the leaderboard.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 10px; vertical-align: top; width: 24px;">💬</td>
                    <td style="padding-bottom: 10px;">
                      <strong style="color: #ffffff;">Live Banter & Communities:</strong> Chat, react with emojis, and debate plays with an electric community of sports enthusiasts.
                    </td>
                  </tr>
                  <tr>
                    <td style="vertical-align: top; width: 24px;">🎁</td>
                    <td>
                      <strong style="color: #ffffff;">Playbook & Rewards:</strong> Unlock exclusive badges, merchandise, and fan perks as you engage.
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0 24px 0;">
                <a href="${appUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #238636 0%, #2ea043 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; padding: 14px 36px; border-radius: 9999px; box-shadow: 0 4px 14px rgba(35, 134, 54, 0.4); border: 1px solid rgba(255,255,255,0.15);">
                  Join Flip LIVE Now &rarr;
                </a>
              </div>

              <!-- Direct Link Fallback -->
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #8b949e; text-align: center;">
                Or open this link directly in your browser:<br>
                <a href="${appUrl}" style="color: #58a6ff; text-decoration: underline; word-break: break-all;">${appUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0d1117; border-top: 1px solid #21262d; padding: 22px 30px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #8b949e; line-height: 1.5;">
                You received this email because you submitted an RSVP request on the SportsFan360 waitlist.<br>
                &copy; ${new Date().getFullYear()} SportsFan360. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action } = body || {};

    if (!id || !action || !["accept", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Valid 'id' and 'action' ('accept' | 'reject') are required" },
        { status: 400 }
      );
    }

    // 1. Fetch the user's existing record to retrieve their email & name
    let userRecord: any = null;

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { id },
        })
      );
      if (getRes.Item) {
        userRecord = getRes.Item;
      }
    } catch (dynErr) {
      console.warn("[invite-waitlist PATCH] DynamoDB fetch notice:", dynErr);
    }

    if (!userRecord && db) {
      try {
        const docSnap = await db.collection("userwaitinglist").doc(id).get();
        if (docSnap.exists) {
          userRecord = { id: docSnap.id, ...docSnap.data() };
        }
      } catch (fsErr) {
        console.warn("[invite-waitlist PATCH] Firestore fetch notice:", fsErr);
      }
    }

    if (!userRecord) {
      return NextResponse.json(
        { success: false, error: "Waitlist record not found" },
        { status: 404 }
      );
    }

    const recipientName = (userRecord.fullName || userRecord.name || "Sports Fan").trim();
    const recipientEmail = (userRecord.email || "").trim();
    const newStatus = action === "accept" ? "accepted" : "rejected";
    const now = Date.now();
    let emailSent = false;
    let emailError: string | null = null;

    // 2. If action is ACCEPT, send Flip LIVE invitation email via nodemailer
    if (action === "accept") {
      if (!recipientEmail || !recipientEmail.includes("@")) {
        return NextResponse.json(
          { success: false, error: "Cannot accept user: No valid email address found in record" },
          { status: 400 }
        );
      }

      try {
        const { text, html } = generateFlipLiveInviteEmail(recipientName);
        const fromEmail = (process.env.EMAIL || "noreply@sportsfan360.com").trim().replace(/^["']|["']$/g, "");

        await transporter.sendMail({
          from: `"SportsFan360 - Flip LIVE" <${fromEmail}>`,
          to: recipientEmail,
          subject: "You're Invited to Join Flip LIVE! 🎉",
          text,
          html,
        });

        emailSent = true;
        console.log(`✅ [invite-waitlist] Sent Flip LIVE invite email to: ${recipientEmail}`);
      } catch (mailErr: any) {
        console.error("❌ [invite-waitlist] Failed to send invite email:", mailErr);
        emailError = mailErr?.message || "Failed to send email";
      }
    }

    // 3. Update status in DynamoDB (userwaitinglist table)
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id },
          UpdateExpression:
            "SET #st = :st, #up = :up" +
            (action === "accept" ? ", acceptedAt = :at, emailSent = :es" : ", rejectedAt = :at"),
          ExpressionAttributeNames: {
            "#st": "status",
            "#up": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":st": newStatus,
            ":up": now,
            ":at": now,
            ...(action === "accept" ? { ":es": emailSent } : {}),
          },
        })
      );
    } catch (dynErr) {
      console.warn("[invite-waitlist PATCH] DynamoDB update notice:", dynErr);
    }

    // Secondary update to IdentityAndAccess fallback record if exists
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.IdentityAndAccess || "IdentityAndAccess",
          Key: {
            entityId: `WAITLIST#${id}`,
            sk: `USER#${recipientEmail.toLowerCase()}`,
          },
          UpdateExpression: "SET #st = :st, #up = :up",
          ExpressionAttributeNames: {
            "#st": "status",
            "#up": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":st": newStatus,
            ":up": now,
          },
        })
      );
    } catch {
      // ignore if fallback record doesn't exist
    }

    // 4. Update status in Firestore (userwaitinglist collection)
    if (db) {
      try {
        await db.collection("userwaitinglist").doc(id).set(
          {
            status: newStatus,
            updatedAt: now,
            ...(action === "accept" ? { acceptedAt: now, emailSent } : { rejectedAt: now }),
          },
          { merge: true }
        );
      } catch (fsErr) {
        console.warn("[invite-waitlist PATCH] Firestore update notice:", fsErr);
      }
    }

    return NextResponse.json({
      success: true,
      message:
        action === "accept"
          ? emailSent
            ? `Successfully accepted ${recipientName} and sent Flip LIVE invitation email!`
            : `User accepted, but email sending failed: ${emailError}`
          : `Waitlist request for ${recipientName} has been rejected.`,
      status: newStatus,
      emailSent,
      emailError,
    });
  } catch (error: unknown) {
    console.error("Error in PATCH /api/invite-waitlist:", error);
    const message = error instanceof Error ? error.message : "Failed to update waitlist record";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

