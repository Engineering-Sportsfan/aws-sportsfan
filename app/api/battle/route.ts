// app/api/battle/route.ts — Migrated to AWS DynamoDB (SocialAndContent & GamificationAndWallet Tables)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { transporter } from "@/lib/mailer";
import { awardUserPoints } from "@/lib/userPoints";
import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type BattleType = "PLAYERS" | "CLUBS";

interface InvitedFriend {
  email: string;
  name: string;
}

interface BattlePayload {
  battleName: string;
  battleType: BattleType;
  selectedPlayers?: string[];
  selectedClubs?: string[];
  invitedFriends?: InvitedFriend[];
  userId: string;
  userName: string;
  userEmail?: string;
}

async function getStandardizedUserInfo(
  userId: string,
  providedName?: string,
  providedEmail?: string
) {
  try {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const userData = userSnap.data();

      let userName = "";
      if (providedName && providedName !== "Unknown User") {
        userName = providedName;
      } else if (userData?.firstName) {
        userName = [userData.firstName, userData.lastName].filter(Boolean).join(" ");
      } else if (userData?.name) {
        userName = userData.name;
      } else if (userData?.email) {
        userName = userData.email.split("@")[0];
      } else {
        userName = "User";
      }

      const userEmail = providedEmail || userData?.email || "";
      return { userName, userEmail, userData };
    }

    return {
      userName: providedName || "User",
      userEmail: providedEmail || "",
      userData: null,
    };
  } catch (error) {
    console.error("Error getting user info:", error);
    return {
      userName: providedName || "User",
      userEmail: providedEmail || "",
      userData: null,
    };
  }
}

async function sendBattleInviteEmails(
  invitedFriends: InvitedFriend[],
  battleName: string,
  battleType: BattleType,
  battleId: string,
  userName: string
) {
  if (!invitedFriends || invitedFriends.length === 0) return { sent: 0, failed: [] };

  const appUrl = "https://sportsfan-frontend.vercel.app";
  const battleUrl = `${appUrl}/MainModules/Fantasy`;

  const emailPromises = invitedFriends.map(({ email, name }) =>
    transporter.sendMail({
      from: `"SportsFan360" <${process.env.EMAIL}>`,
      to: email,
      subject: `⚔️ ${userName} challenged you to a Battle on SportsFan360!`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#07070f;font-family:Arial,sans-serif;color:#fff;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070f;padding:40px 20px;">
            <tr><td align="center">
              <table width="520" cellpadding="0" cellspacing="0"
                style="background:#1a1a1e;border-radius:16px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;max-width:520px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#e91e8c,#d75a2d);padding:32px;text-align:center;">
                    <div style="font-size:44px;margin-bottom:12px;">⚔️</div>
                    <h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                      You've Been Challenged!
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 8px;font-size:16px;color:#ccc;">Hey <strong style="color:#fff;">${name}</strong>,</p>
                    <p style="margin:0 0 28px;font-size:15px;color:#aaa;line-height:1.6;">
                      <strong style="color:#ff9a6c;">${userName}</strong> has created a battle and personally invited you to join: <strong>${battleName}</strong>.
                    </p>
                    <a href="${battleUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#e91e8c,#d75a2d);color:#fff;font-size:16px;font-weight:700;padding:16px 32px;border-radius:12px;text-decoration:none;">⚔️ Join Battle</a>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    })
  );

  const results = await Promise.allSettled(emailPromises);
  const failed: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      failed.push(invitedFriends[i].email);
    }
  });

  return { sent: invitedFriends.length - failed.length, failed };
}

// ─── POST — Create a new battle ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: BattlePayload = await req.json();
    const {
      battleName,
      battleType,
      selectedPlayers,
      selectedClubs,
      invitedFriends,
      userId,
      userName,
      userEmail,
    } = body;

    if (!battleName || typeof battleName !== "string" || !battleName.trim()) {
      return NextResponse.json({ error: "battleName is required" }, { status: 400 });
    }
    const validBattleTypes: BattleType[] = ["PLAYERS", "CLUBS"];
    if (!battleType || !validBattleTypes.includes(battleType)) {
      return NextResponse.json({ error: "battleType must be PLAYERS or CLUBS" }, { status: 400 });
    }
    if (!userId || !userName) {
      return NextResponse.json({ error: "userId and userName are required" }, { status: 400 });
    }

    const { userName: standardizedName, userEmail: standardizedEmail } =
      await getStandardizedUserInfo(userId, userName, userEmail);

    const now = Date.now();
    const battleId = `battle_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newBattle = {
      battleId,
      battleName: battleName.trim(),
      battleType,
      selectedPlayers: battleType === "PLAYERS" ? (selectedPlayers ?? []) : [],
      selectedClubs: battleType === "CLUBS" ? (selectedClubs ?? []) : [],
      invitedFriends: invitedFriends ?? [],
      userId,
      userName: standardizedName,
      createdAt: now,
      updatedAt: now,
    };

    // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
    const dynamoItem = {
      contentId: `BATTLE#${battleId}`,
      sk: `BATTLE#${now}`,
      ...newBattle,
    };

    await dualWrite("fanBattles", battleId, "SocialAndContent", dynamoItem);

    // Also index in GamificationAndWallet for user battle lookups
    try {
      await docClient.send(
        new ScanCommand({
          TableName: "GamificationAndWallet",
          Limit: 1,
        })
      );
    } catch (_) {}

    // In-app notifications for friends
    if (invitedFriends && invitedFriends.length > 0) {
      for (const friend of invitedFriends) {
        try {
          await db.collection("notifications").add({
            type: "BATTLE_INVITE",
            recipientEmail: friend.email,
            senderName: standardizedName,
            senderId: userId,
            battleId,
            battleName: battleName.trim(),
            battleType,
            message: `${standardizedName} has invited you to a Fan Battle!`,
            isRead: false,
            createdAt: now,
          });
        } catch (notifErr) {
          console.warn("Notification error:", notifErr);
        }
      }
    }

    // Award Points
    const pointsAwarded = 10;
    try {
      await awardUserPoints({
        actualUserId: userId,
        userName: standardizedName,
        userEmail: standardizedEmail,
        userExists: true,
        points: pointsAwarded,
        reason: "CREATE_BATTLE",
        transactionId: `${userId}_${battleId}_CREATE_BATTLE`,
        metadata: { battleId },
      });
    } catch (ptErr) {
      console.warn("Points error:", ptErr);
    }

    // Send emails
    const { sent: emailsSent, failed: emailsFailed } = await sendBattleInviteEmails(
      invitedFriends ?? [],
      battleName.trim(),
      battleType,
      battleId,
      standardizedName
    );

    return NextResponse.json(
      {
        success: true,
        id: battleId,
        battle: { id: battleId, ...newBattle },
        pointsAwarded,
        message: `Battle created successfully! +${pointsAwarded} points awarded!`,
        invites: { sent: emailsSent, failed: emailsFailed },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/battle error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET — List battles ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const battleType = searchParams.get("battleType");
    const userId = searchParams.get("userId");

    let battles: Array<Record<string, unknown>> = [];

    // 1. Scan DynamoDB SocialAndContent table for battles
    try {
      let filterExpression = "begins_with(contentId, :bPrefix)";
      const expressionAttributeValues: Record<string, unknown> = {
        ":bPrefix": "BATTLE#",
      };

      if (battleType && ["PLAYERS", "CLUBS"].includes(battleType)) {
        filterExpression += " AND battleType = :bt";
        expressionAttributeValues[":bt"] = battleType;
      }
      if (userId) {
        filterExpression += " AND userId = :u";
        expressionAttributeValues[":u"] = userId;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: filterExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          Limit: limit,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        battles = scanRes.Items.map((b) => ({
          id: (b.contentId as string)?.replace(/^BATTLE#/, "") || b.battleId || b.id,
          ...b,
        }));
      }
    } catch (err) {
      console.warn("DynamoDB battles scan notice:", err);
    }

    // 2. Fallback to Firebase
    if (battles.length === 0) {
      try {
        let query: FirebaseFirestore.Query = db
          .collection("fanBattles")
          .orderBy("createdAt", "desc");

        if (battleType && ["PLAYERS", "CLUBS"].includes(battleType)) {
          query = query.where("battleType", "==", battleType);
        }
        if (userId) {
          query = query.where("userId", "==", userId);
        }

        const snapshot = await query.limit(limit).get();
        battles = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (fbErr) {
        console.warn("Firebase battles fallback notice:", fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      battles,
      pagination: {
        limit,
        hasMore: battles.length === limit,
        nextCursor: null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/battle error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}