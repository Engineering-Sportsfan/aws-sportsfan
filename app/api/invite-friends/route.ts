import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { transporter } from "@/lib/mailer";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

interface InviteFriendRecord {
  id?: string;
  name: string;
  email?: string;
  mobileNo?: string;
  invitedBy?: string;
  message?: string;
  channels: Array<"email" | "mobile">;
  emailSent: boolean;
  status: "pending" | "sent";
  createdAt: number;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mobileRegex = /^\+?[0-9]{7,15}$/;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const limit = Number.parseInt(searchParams.get("limit") || "50", 10);

    if (id) {
      let invite: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB
      try {
        const dRes = await docClient.send(
          new GetCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `INVITE#${id}`, sk: "INVITE#META" },
          }),
        );
        if (dRes.Item) {
          invite = { id, ...dRes.Item };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[invite-friends GET id] DynamoDB notice:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo || !invite) {
        const doc = await db.collection("inviteFriends").doc(id).get();
        if (!doc.exists) {
          return NextResponse.json(
            { success: false, message: "Invite not found" },
            { status: 404 },
          );
        }
        invite = { id: doc.id, ...(doc.data() as InviteFriendRecord) };
      }

      return NextResponse.json({
        success: true,
        invite,
      });
    }

    let invites: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const sRes = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :inv) AND #sk = :sk",
          ExpressionAttributeNames: {
            "#sk": "sk",
          },
          ExpressionAttributeValues: {
            ":inv": "INVITE#",
            ":sk": "INVITE#META",
          },
        }),
      );

      if (sRes.Items && sRes.Items.length > 0) {
        invites = sRes.Items.map((item) => ({
          id:
            item.id ||
            (item.entityId as string)?.replace(/^INVITE#/, "") ||
            "",
          ...item,
        }));
        invites.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        invites = invites.slice(0, Number.isNaN(limit) ? 50 : limit);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[invite-friends GET list] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      const snapshot = await db
        .collection("inviteFriends")
        .orderBy("createdAt", "desc")
        .limit(Number.isNaN(limit) ? 50 : limit)
        .get();

      invites = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as InviteFriendRecord),
      }));
    }

    return NextResponse.json({
      success: true,
      invites,
      count: invites.length,
    });
  } catch (error: unknown) {
    console.error("GET /api/invite-friends error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch invites";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      mobileNo,
      invitedBy,
      message,
    }: {
      name?: string;
      email?: string;
      mobileNo?: string;
      invitedBy?: string;
      message?: string;
    } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, message: "name is required" },
        { status: 400 },
      );
    }

    const hasEmail = typeof email === "string" && email.trim().length > 0;
    const hasMobile =
      typeof mobileNo === "string" && mobileNo.trim().length > 0;

    if (!hasEmail && !hasMobile) {
      return NextResponse.json(
        {
          success: false,
          message: "Provide at least one contact: email or mobileNo",
        },
        { status: 400 },
      );
    }

    if (hasEmail && !emailRegex.test(email!.trim())) {
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 },
      );
    }

    if (hasMobile && !mobileRegex.test(mobileNo!.trim())) {
      return NextResponse.json(
        { success: false, message: "Invalid mobile number format" },
        { status: 400 },
      );
    }

    const channels: Array<"email" | "mobile"> = [];
    if (hasEmail) channels.push("email");
    if (hasMobile) channels.push("mobile");

    let emailSent = false;

    if (hasEmail) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL,
          to: email!.trim(),
          subject: "You are invited to SportFan",
          text:
            message?.trim() ||
            `Hi ${name.trim()},\n\nYou have been invited to join SportFan.\n\nSee you inside!`,
        });

        emailSent = true;
      } catch (mailError) {
        console.error("Invite email send failed:", mailError);
      }
    }

    const inviteId = randomUUID();
    const now = Date.now();

    const inviteRecord: InviteFriendRecord = {
      id: inviteId,
      name: name.trim(),
      email: hasEmail ? email!.trim().toLowerCase() : undefined,
      mobileNo: hasMobile ? mobileNo!.trim() : undefined,
      invitedBy: invitedBy?.trim() || "admin",
      message: message?.trim() || "",
      channels,
      emailSent,
      status: emailSent || hasMobile ? "sent" : "pending",
      createdAt: now,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `INVITE#${inviteId}`,
            sk: "INVITE#META",
            ...inviteRecord,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[invite-friends POST] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      await db.collection("inviteFriends").doc(inviteId).set(inviteRecord);
    } catch (fsErr) {
      console.error("[invite-friends POST] Firestore error:", fsErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Invite created successfully",
        invite: inviteRecord,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/invite-friends error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create invite";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "id is required" },
        { status: 400 },
      );
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `INVITE#${id}`, sk: "INVITE#META" },
        }),
      );
    } catch (dynErr) {
      console.error("[invite-friends DELETE] DynamoDB error:", dynErr);
    }

    // 2. Delete from Firestore
    try {
      await db.collection("inviteFriends").doc(id).delete();
    } catch (fsErr) {
      console.error("[invite-friends DELETE] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Invite deleted successfully",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/invite-friends error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete invite";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
