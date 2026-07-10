import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { transporter } from "@/lib/mailer";

interface InviteFriendRecord {
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
      const doc = await db.collection("inviteFriends").doc(id).get();

      if (!doc.exists) {
        return NextResponse.json({ success: false, message: "Invite not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        invite: {
          id: doc.id,
          ...(doc.data() as InviteFriendRecord),
        },
      });
    }

    const snapshot = await db
      .collection("inviteFriends")
      .orderBy("createdAt", "desc")
      .limit(Number.isNaN(limit) ? 50 : limit)
      .get();

    const invites = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as InviteFriendRecord),
    }));

    return NextResponse.json({
      success: true,
      invites,
      count: invites.length,
    });
  } catch (error: unknown) {
    console.error("GET /api/invite-friends error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch invites";
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
      return NextResponse.json({ success: false, message: "name is required" }, { status: 400 });
    }

    const hasEmail = typeof email === "string" && email.trim().length > 0;
    const hasMobile = typeof mobileNo === "string" && mobileNo.trim().length > 0;

    if (!hasEmail && !hasMobile) {
      return NextResponse.json(
        { success: false, message: "Provide at least one contact: email or mobileNo" },
        { status: 400 }
      );
    }

    if (hasEmail && !emailRegex.test(email!.trim())) {
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
    }

    if (hasMobile && !mobileRegex.test(mobileNo!.trim())) {
      return NextResponse.json({ success: false, message: "Invalid mobile number format" }, { status: 400 });
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

    const inviteRecord: InviteFriendRecord = {
      name: name.trim(),
      email: hasEmail ? email!.trim().toLowerCase() : undefined,
      mobileNo: hasMobile ? mobileNo!.trim() : undefined,
      invitedBy: invitedBy?.trim() || "admin",
      message: message?.trim() || "",
      channels,
      emailSent,
      status: emailSent || hasMobile ? "sent" : "pending",
      createdAt: Date.now(),
    };

    const docRef = await db.collection("inviteFriends").add(inviteRecord);

    return NextResponse.json(
      {
        success: true,
        message: "Invite created successfully",
        invite: {
          id: docRef.id,
          ...inviteRecord,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("POST /api/invite-friends error:", error);
    const message = error instanceof Error ? error.message : "Failed to create invite";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "id is required" }, { status: 400 });
    }

    const ref = db.collection("inviteFriends").doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ success: false, message: "Invite not found" }, { status: 404 });
    }

    await ref.delete();

    return NextResponse.json({
      success: true,
      message: "Invite deleted successfully",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/invite-friends error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete invite";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
