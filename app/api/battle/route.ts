// // api/battle/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
// import { transporter } from "@/lib/mailer";

// type BattleType = "PLAYERS" | "CLUBS";

// interface InvitedFriend {
//   email: string;
//   name: string;
// }

// interface BattlePayload {
//   battleName: string;
//   battleType: BattleType;
//   selectedPlayers?: string[];
//   selectedClubs?: string[];
//   invitedFriends?: InvitedFriend[];
//   userId: string;
//   userName: string;
//   userEmail?: string;
// }

// // Helper function to get standardized user info
// async function getStandardizedUserInfo(
//   userId: string,
//   providedName?: string,
//   providedEmail?: string
// ) {
//   try {
//     const userRef = db.collection("users").doc(userId);
//     const userSnap = await userRef.get();

//     if (userSnap.exists) {
//       const userData = userSnap.data();

//       let userName = "";
//       if (providedName && providedName !== "Unknown User") {
//         userName = providedName;
//       } else if (userData?.firstName) {
//         userName = [userData.firstName, userData.lastName].filter(Boolean).join(" ");
//       } else if (userData?.name) {
//         userName = userData.name;
//       } else if (userData?.email) {
//         userName = userData.email.split("@")[0];
//       } else {
//         userName = "User";
//       }

//       const userEmail = providedEmail || userData?.email || "";

//       if (
//         userData?.totalPoints === undefined ||
//         userData?.pointsBreakdown === undefined
//       ) {
//         await userRef.update({
//           totalPoints: userData?.totalPoints || 0,
//           pointsBreakdown: {
//             CREATE_BATTLE: 0,
//             PLAY_BATTLE: 0,
//             INVITE_ACCEPTED: 0,
//             PREDICTION_CORRECT: 0,
//             FANTASY_WIN: 0,
//             DAILY_LOGIN: 0,
//             SHARE_BATTLE: 0,
//           },
//           lastUpdated: Date.now(),
//         });
//       }

//       return { userName, userEmail, userData };
//     }

//     return {
//       userName: providedName || "User",
//       userEmail: providedEmail || "",
//       userData: null,
//     };
//   } catch (error) {
//     console.error("Error getting user info:", error);
//     return {
//       userName: providedName || "User",
//       userEmail: providedEmail || "",
//       userData: null,
//     };
//   }
// }

// // Helper to ensure user has points fields
// async function ensureUserHasPointsFields(
//   userId: string,
//   userEmail: string,
//   userName: string
// ) {
//   const userRef = db.collection("users").doc(userId);
//   const userSnap = await userRef.get();

//   if (!userSnap.exists) {
//     return {
//       exists: false,
//       ref: userRef,
//       data: {
//         userId,
//         email: userEmail,
//         name: userName,
//         firstName: userName.split(" ")[0] || "",
//         lastName: userName.split(" ")[1] || "",
//         totalPoints: 0,
//         pointsBreakdown: {
//           CREATE_BATTLE: 0,
//           PLAY_BATTLE: 0,
//           INVITE_ACCEPTED: 0,
//           PREDICTION_CORRECT: 0,
//           FANTASY_WIN: 0,
//           DAILY_LOGIN: 0,
//           SHARE_BATTLE: 0,
//         },
//         createdAt: Date.now(),
//         lastUpdated: Date.now(),
//         status: "active",
//         role: "user",
//       },
//     };
//   }

//   const userData = userSnap.data();

//   const updates: {
//     totalPoints?: number;
//     pointsBreakdown?: {
//       CREATE_BATTLE: number;
//       PLAY_BATTLE: number;
//       INVITE_ACCEPTED: number;
//       PREDICTION_CORRECT: number;
//       FANTASY_WIN: number;
//       DAILY_LOGIN: number;
//       SHARE_BATTLE: number;
//     };
//     lastUpdated?: number;
//   } = {};
//   let needsUpdate = false;

//   if (userData?.totalPoints === undefined) {
//     updates.totalPoints = 0;
//     needsUpdate = true;
//   }

//   if (userData?.pointsBreakdown === undefined) {
//     updates.pointsBreakdown = {
//       CREATE_BATTLE: 0,
//       PLAY_BATTLE: 0,
//       INVITE_ACCEPTED: 0,
//       PREDICTION_CORRECT: 0,
//       FANTASY_WIN: 0,
//       DAILY_LOGIN: 0,
//       SHARE_BATTLE: 0,
//     };
//     needsUpdate = true;
//   }

//   if (needsUpdate) {
//     updates.lastUpdated = Date.now();
//     await userRef.update(updates);
//   }

//   return { exists: true, ref: userRef, data: userData };
// }

// // ─── Send battle invite emails ────────────────────────────────────────────────
// async function sendBattleInviteEmails(
//   invitedFriends: InvitedFriend[],
//   battleName: string,
//   battleType: BattleType,
//   battleId: string,
//   userName: string
// ) {
//   if (!invitedFriends || invitedFriends.length === 0) return { sent: 0, failed: [] };

//   const appUrl = "https://sportsfan-frontend.vercel.app";
//   const battleUrl = `${appUrl}/MainModules/Fantasy`;

//   const emailPromises = invitedFriends.map(({ email, name }) =>
//     transporter.sendMail({
//       from: `"SportsFan360" <${process.env.EMAIL}>`,
//       to: email,
//       subject: `⚔️ ${userName} challenged you to a Battle on SportsFan360!`,
//       html: `
//         <!DOCTYPE html>
//         <html>
//         <body style="margin:0;padding:0;background:#07070f;font-family:Arial,sans-serif;color:#fff;">
//           <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070f;padding:40px 20px;">
//             <tr><td align="center">
//               <table width="520" cellpadding="0" cellspacing="0"
//                 style="background:#1a1a1e;border-radius:16px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;max-width:520px;">

//                 <!-- Header -->
//                 <tr>
//                   <td style="background:linear-gradient(135deg,#e91e8c,#d75a2d);padding:32px;text-align:center;">
//                     <div style="font-size:44px;margin-bottom:12px;">⚔️</div>
//                     <h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
//                       You've Been Challenged!
//                     </h1>
//                     <p style="margin:10px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">
//                       A battle awaits you on SportsFan360
//                     </p>
//                   </td>
//                 </tr>

//                 <!-- Body -->
//                 <tr>
//                   <td style="padding:32px;">
//                     <p style="margin:0 0 8px;font-size:16px;color:#ccc;">
//                       Hey <strong style="color:#fff;">${name}</strong>,
//                     </p>
//                     <p style="margin:0 0 28px;font-size:15px;color:#aaa;line-height:1.6;">
//                       <strong style="color:#ff9a6c;">${userName}</strong> has created a battle and personally invited you to join. Think you can win?
//                     </p>

//                     <!-- Battle Card -->
//                     <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(215,90,45,0.35);border-radius:12px;padding:20px 24px;margin-bottom:28px;">
//                       <table width="100%" cellpadding="0" cellspacing="0">
//                         <tr>
//                           <td style="padding-bottom:14px;">
//                             <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#666;">Battle Name</p>
//                             <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">${battleName}</p>
//                           </td>
//                         </tr>
//                         <tr>
//                           <td>
//                             <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#666;">Battle Type</p>
//                             <p style="margin:0;font-size:15px;font-weight:600;color:#ff9a6c;">
//                               ${battleType === "PLAYERS" ? "👤 Players Battle" : "🏏 Clubs Battle"}
//                             </p>
//                           </td>
//                         </tr>
//                       </table>
//                     </div>

//                     <!-- How it works -->
//                     <p style="margin:0 0 14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#666;">
//                       How It Works
//                     </p>
//                     <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
//                       <tr><td style="padding:0 0 10px 0;">
//                         <table cellpadding="0" cellspacing="0"><tr>
//                           <td style="font-size:18px;padding-right:12px;vertical-align:top;">1️⃣</td>
//                           <td style="font-size:14px;color:#aaa;line-height:1.5;vertical-align:top;">Click the button below to view the battle</td>
//                         </tr></table>
//                       </td></tr>
//                       <tr><td style="padding:0 0 10px 0;">
//                         <table cellpadding="0" cellspacing="0"><tr>
//                           <td style="font-size:18px;padding-right:12px;vertical-align:top;">2️⃣</td>
//                           <td style="font-size:14px;color:#aaa;line-height:1.5;vertical-align:top;">Sign up or log in to your SportsFan360 account</td>
//                         </tr></table>
//                       </td></tr>
//                       <tr><td style="padding:0 0 10px 0;">
//                         <table cellpadding="0" cellspacing="0"><tr>
//                           <td style="font-size:18px;padding-right:12px;vertical-align:top;">3️⃣</td>
//                           <td style="font-size:14px;color:#aaa;line-height:1.5;vertical-align:top;">Cast your vote and compete with other fans</td>
//                         </tr></table>
//                       </td></tr>
//                       <tr><td>
//                         <table cellpadding="0" cellspacing="0"><tr>
//                           <td style="font-size:18px;padding-right:12px;vertical-align:top;">4️⃣</td>
//                           <td style="font-size:14px;color:#aaa;line-height:1.5;vertical-align:top;">Track live results and see who wins!</td>
//                         </tr></table>
//                       </td></tr>
//                     </table>

//                     <!-- CTA Button -->
//                     <a href="${battleUrl}"
//                       style="display:block;text-align:center;background:linear-gradient(135deg,#e91e8c,#d75a2d);
//                       color:#fff;font-size:16px;font-weight:700;padding:16px 32px;
//                       border-radius:12px;text-decoration:none;margin-bottom:16px;letter-spacing:0.3px;">
//                       ⚔️ &nbsp;Join the Battle Now
//                     </a>

//                     <p style="margin:0;text-align:center;font-size:13px;color:#555;">
//                       Or visit
//                       <a href="${appUrl}" style="color:#d75a2d;text-decoration:none;margin-left:4px;">
//                         sportsfan-frontend.vercel.app
//                       </a>
//                     </p>
//                   </td>
//                 </tr>

//                 <!-- Footer -->
//                 <tr>
//                   <td style="padding:20px 32px 24px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
//                     <p style="margin:0;font-size:12px;color:#444;line-height:1.7;">
//                       You received this because <strong style="color:#666;">${userName}</strong> invited you to SportsFan360.<br/>
//                       If you didn't expect this email, you can safely ignore it.
//                     </p>
//                   </td>
//                 </tr>

//               </table>
//             </td></tr>
//           </table>
//         </body>
//         </html>
//       `,
//     })
//   );

//   const results = await Promise.allSettled(emailPromises);

//   const failed: string[] = [];
//   results.forEach((result, i) => {
//     if (result.status === "rejected") {
//       console.error(`Failed to send invite to ${invitedFriends[i].email}:`, result.reason);
//       failed.push(invitedFriends[i].email);
//     }
//   });

//   return { sent: invitedFriends.length - failed.length, failed };
// }

// // ─── POST — Create a new battle ───────────────────────────────────────────────
// export async function POST(req: NextRequest) {
//   try {
//     const body: BattlePayload = await req.json();

//     const {
//       battleName,
//       battleType,
//       selectedPlayers,
//       selectedClubs,
//       invitedFriends,
//       userId,
//       userName,
//       userEmail,
//     } = body;

//     // ── Required field validation ──
//     if (!battleName || typeof battleName !== "string" || !battleName.trim()) {
//       return NextResponse.json(
//         { error: "battleName is required and must be a non-empty string" },
//         { status: 400 }
//       );
//     }

//     const validBattleTypes: BattleType[] = ["PLAYERS", "CLUBS"];
//     if (!battleType || !validBattleTypes.includes(battleType)) {
//       return NextResponse.json(
//         { error: "battleType is required and must be PLAYERS or CLUBS" },
//         { status: 400 }
//       );
//     }

//     if (!userId || typeof userId !== "string") {
//       return NextResponse.json({ error: "userId is required" }, { status: 400 });
//     }

//     if (!userName || typeof userName !== "string") {
//       return NextResponse.json({ error: "userName is required" }, { status: 400 });
//     }

//     if (battleType === "PLAYERS") {
//       if (!Array.isArray(selectedPlayers) || selectedPlayers.length === 0) {
//         return NextResponse.json(
//           { error: "selectedPlayers must be a non-empty array when battleType is PLAYERS" },
//           { status: 400 }
//         );
//       }
//     }

//     if (battleType === "CLUBS") {
//       if (!Array.isArray(selectedClubs) || selectedClubs.length === 0) {
//         return NextResponse.json(
//           { error: "selectedClubs must be a non-empty array when battleType is CLUBS" },
//           { status: 400 }
//         );
//       }
//     }

//     // ── Validate invitedFriends shape if provided ──
//     if (invitedFriends !== undefined) {
//       if (!Array.isArray(invitedFriends)) {
//         return NextResponse.json(
//           { error: "invitedFriends must be an array" },
//           { status: 400 }
//         );
//       }

//       for (const friend of invitedFriends) {
//         if (!friend.email || !friend.name) {
//           return NextResponse.json(
//             { error: "Each invitedFriend must have both email and name fields" },
//             { status: 400 }
//           );
//         }
//         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//         if (!emailRegex.test(friend.email)) {
//           return NextResponse.json(
//             { error: `Invalid email address: ${friend.email}` },
//             { status: 400 }
//           );
//         }
//       }
//     }

//     // Get standardized user info
//     const { userName: standardizedName, userEmail: standardizedEmail } =
//       await getStandardizedUserInfo(userId, userName, userEmail);

//     // Ensure user has points fields
//     await ensureUserHasPointsFields(userId, standardizedEmail, standardizedName);

//     // Create a batch for atomic operations
//     const batch = db.batch();

//     // ── Create the battle document ──
//     const newBattle = {
//       battleName: battleName.trim(),
//       battleType,
//       selectedPlayers: battleType === "PLAYERS" ? (selectedPlayers ?? []) : [],
//       selectedClubs: battleType === "CLUBS" ? (selectedClubs ?? []) : [],
//       invitedFriends: invitedFriends ?? [],
//       userId,
//       userName: standardizedName,
//       createdAt: Date.now(),
//       updatedAt: Date.now(),
//     };

//     const battleRef = db.collection("fanBattles").doc();
//     batch.set(battleRef, newBattle);

//     // ── Award points for creating a battle ──
//     const pointsToAward = 10;

//     const transactionId = `${userId}_${Date.now()}_CREATE_BATTLE`;
//     const transactionRef = db.collection("userPointTransactions").doc(transactionId);

//     batch.set(transactionRef, {
//       userId,
//       userEmail: standardizedEmail,
//       userName: standardizedName,
//       points: pointsToAward,
//       reason: "CREATE_BATTLE",
//       metadata: { battleId: battleRef.id },
//       createdAt: Date.now(),
//     });

//     const userRef = db.collection("users").doc(userId);
//     const userSnap = await userRef.get();

//     if (!userSnap.exists) {
//       batch.set(userRef, {
//         userId,
//         email: standardizedEmail,
//         name: standardizedName,
//         firstName: standardizedName.split(" ")[0] || "",
//         lastName: standardizedName.split(" ")[1] || "",
//         totalPoints: pointsToAward,
//         pointsBreakdown: {
//           CREATE_BATTLE: pointsToAward,
//           PLAY_BATTLE: 0,
//           INVITE_ACCEPTED: 0,
//           PREDICTION_CORRECT: 0,
//           FANTASY_WIN: 0,
//           DAILY_LOGIN: 0,
//           SHARE_BATTLE: 0,
//         },
//         createdAt: Date.now(),
//         lastUpdated: Date.now(),
//         status: "active",
//         role: "user",
//       });
//     } else {
//       batch.update(userRef, {
//         totalPoints: FieldValue.increment(pointsToAward),
//         "pointsBreakdown.CREATE_BATTLE": FieldValue.increment(pointsToAward),
//         lastUpdated: Date.now(),
//       });
//     }

//     const globalLeaderboardRef = db.collection("globalLeaderboard").doc(userId);
//     batch.set(
//       globalLeaderboardRef,
//       {
//         userId,
//         userName: standardizedName,
//         userEmail: standardizedEmail,
//         totalPoints: FieldValue.increment(pointsToAward),
//         lastUpdated: Date.now(),
//       },
//       { merge: true }
//     );

//     // ── Create in-app notifications for each invited friend ──────────────────
//     if (invitedFriends && invitedFriends.length > 0) {
//       for (const friend of invitedFriends) {
//         const notifRef = db.collection("notifications").doc();
//         batch.set(notifRef, {
//           type: "BATTLE_INVITE",
//           recipientEmail: friend.email,
//           senderName: standardizedName,
//           senderId: userId,
//           battleId: battleRef.id,
//           battleName: battleName.trim(),
//           battleType,
//           message: `${standardizedName} has invited you to a Fan Battle!`,
//           isRead: false,
//           createdAt: Date.now(),
//         });
//       }
//     }

//     // ── Commit all DB changes (battle + points + notifications) ──────────────
//     await batch.commit();

//     // ── Send invite emails AFTER commit so battleRef.id is real ─────────────
//     const { sent: emailsSent, failed: emailsFailed } = await sendBattleInviteEmails(
//       invitedFriends ?? [],
//       battleName.trim(),
//       battleType,
//       battleRef.id,
//       standardizedName
//     );

//     console.log(
//       `✅ Battle created: ${battleRef.id} | Emails sent: ${emailsSent} | Failed: ${emailsFailed.length}`
//     );

//     return NextResponse.json(
//       {
//         success: true,
//         id: battleRef.id,
//         battle: { id: battleRef.id, ...newBattle },
//         pointsAwarded: pointsToAward,
//         message: `Battle created successfully! +${pointsToAward} points awarded!`,
//         invites: {
//           sent: emailsSent,
//           failed: emailsFailed,
//         },
//       },
//       { status: 201 }
//     );
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/battles error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── GET — List battles (with filters + cursor pagination) ────────────────────
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);

//     const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
//     const battleType = searchParams.get("battleType");
//     const userId = searchParams.get("userId");
//     const lastDocId = searchParams.get("lastDocId");
//     const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

//     let query: FirebaseFirestore.Query = db
//       .collection("fanBattles")
//       .orderBy("createdAt", "desc");

//     if (battleType && ["PLAYERS", "CLUBS"].includes(battleType)) {
//       query = query.where("battleType", "==", battleType);
//     }

//     if (userId) {
//       query = query.where("userId", "==", userId);
//     }

//     query = query.limit(limit);

//     if (lastDocId && lastDocCreatedAt) {
//       const lastDocRef = db.collection("fanBattles").doc(lastDocId);
//       const lastDocSnap = await lastDocRef.get();
//       if (lastDocSnap.exists) {
//         query = query.startAfter(lastDocSnap);
//       }
//     }

//     const snapshot = await query.get();

//     const battles = snapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));

//     const lastDoc = snapshot.docs[snapshot.docs.length - 1];

//     return NextResponse.json({
//       success: true,
//       battles,
//       pagination: {
//         limit,
//         hasMore: battles.length === limit,
//         nextCursor:
//           battles.length === limit
//             ? {
//                 lastDocId: lastDoc?.id,
//                 lastDocCreatedAt: lastDoc?.data()?.createdAt,
//               }
//             : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/battles error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }





// api/battle/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
import { transporter } from "@/lib/mailer";
import { awardUserPoints } from "@/lib/userPoints";

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

// ── Resolve display name and email from Firestore ────────────────────────────
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

// ─── Send battle invite emails ────────────────────────────────────────────────
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

                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#e91e8c,#d75a2d);padding:32px;text-align:center;">
                    <div style="font-size:44px;margin-bottom:12px;">⚔️</div>
                    <h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                      You've Been Challenged!
                    </h1>
                    <p style="margin:10px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">
                      A battle awaits you on SportsFan360
                    </p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 8px;font-size:16px;color:#ccc;">
                      Hey <strong style="color:#fff;">${name}</strong>,
                    </p>
                    <p style="margin:0 0 28px;font-size:15px;color:#aaa;line-height:1.6;">
                      <strong style="color:#ff9a6c;">${userName}</strong> has created a battle and personally invited you to join. Think you can win?
                    </p>

                    <!-- Battle Card -->
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(215,90,45,0.35);border-radius:12px;padding:20px 24px;margin-bottom:28px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding-bottom:14px;">
                            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#666;">Battle Name</p>
                            <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">${battleName}</p>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#666;">Battle Type</p>
                            <p style="margin:0;font-size:15px;font-weight:600;color:#ff9a6c;">
                              ${battleType === "PLAYERS" ? "👤 Players Battle" : "🏏 Clubs Battle"}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- How it works -->
                    <p style="margin:0 0 14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#666;">
                      How It Works
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                      <tr><td style="padding:0 0 10px 0;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="font-size:18px;padding-right:12px;vertical-align:top;">1️⃣</td>
                          <td style="font-size:14px;color:#aaa;line-height:1.5;vertical-align:top;">Click the button below to view the battle</td>
                        </tr></table>
                      </td></tr>
                      <tr><td style="padding:0 0 10px 0;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="font-size:18px;padding-right:12px;vertical-align:top;">2️⃣</td>
                          <td style="font-size:14px;color:#aaa;line-height:1.5;vertical-align:top;">Sign up or log in to your SportsFan360 account</td>
                        </tr></table>
                      </td></tr>
                      <tr><td style="padding:0 0 10px 0;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="font-size:18px;padding-right:12px;vertical-align:top;">3️⃣</td>
                          <td style="font-size:14px;color:#aaa;line-height:1.5;vertical-align:top;">Cast your vote and compete with other fans</td>
                        </tr></table>
                      </td></tr>
                      <tr><td>
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="font-size:18px;padding-right:12px;vertical-align:top;">4️⃣</td>
                          <td style="font-size:14px;color:#aaa;line-height:1.5;vertical-align:top;">Track live results and see who wins!</td>
                        </tr></table>
                      </td></tr>
                    </table>

                    <!-- CTA Button -->
                    <a href="${battleUrl}"
                      style="display:block;text-align:center;background:linear-gradient(135deg,#e91e8c,#d75a2d);
                      color:#fff;font-size:16px;font-weight:700;padding:16px 32px;
                      border-radius:12px;text-decoration:none;margin-bottom:16px;letter-spacing:0.3px;">
                      ⚔️ &nbsp;Join the Battle Now
                    </a>

                    <p style="margin:0;text-align:center;font-size:13px;color:#555;">
                      Or visit
                      <a href="${appUrl}" style="color:#d75a2d;text-decoration:none;margin-left:4px;">
                        sportsfan-frontend.vercel.app
                      </a>
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 32px 24px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
                    <p style="margin:0;font-size:12px;color:#444;line-height:1.7;">
                      You received this because <strong style="color:#666;">${userName}</strong> invited you to SportsFan360.<br/>
                      If you didn't expect this email, you can safely ignore it.
                    </p>
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
      console.error(`Failed to send invite to ${invitedFriends[i].email}:`, result.reason);
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

    // ── Required field validation ────────────────────────────────────────────
    if (!battleName || typeof battleName !== "string" || !battleName.trim()) {
      return NextResponse.json(
        { error: "battleName is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const validBattleTypes: BattleType[] = ["PLAYERS", "CLUBS"];
    if (!battleType || !validBattleTypes.includes(battleType)) {
      return NextResponse.json(
        { error: "battleType is required and must be PLAYERS or CLUBS" },
        { status: 400 }
      );
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!userName || typeof userName !== "string") {
      return NextResponse.json({ error: "userName is required" }, { status: 400 });
    }

    if (battleType === "PLAYERS") {
      if (!Array.isArray(selectedPlayers) || selectedPlayers.length === 0) {
        return NextResponse.json(
          { error: "selectedPlayers must be a non-empty array when battleType is PLAYERS" },
          { status: 400 }
        );
      }
    }

    if (battleType === "CLUBS") {
      if (!Array.isArray(selectedClubs) || selectedClubs.length === 0) {
        return NextResponse.json(
          { error: "selectedClubs must be a non-empty array when battleType is CLUBS" },
          { status: 400 }
        );
      }
    }

    if (invitedFriends !== undefined) {
      if (!Array.isArray(invitedFriends)) {
        return NextResponse.json(
          { error: "invitedFriends must be an array" },
          { status: 400 }
        );
      }

      for (const friend of invitedFriends) {
        if (!friend.email || !friend.name) {
          return NextResponse.json(
            { error: "Each invitedFriend must have both email and name fields" },
            { status: 400 }
          );
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(friend.email)) {
          return NextResponse.json(
            { error: `Invalid email address: ${friend.email}` },
            { status: 400 }
          );
        }
      }
    }

    // ── Resolve display name and email ───────────────────────────────────────
    const { userName: standardizedName, userEmail: standardizedEmail } =
      await getStandardizedUserInfo(userId, userName, userEmail);

    // ── Create battle + notifications (batch) ────────────────────────────────
    const batch = db.batch();

    const newBattle = {
      battleName: battleName.trim(),
      battleType,
      selectedPlayers: battleType === "PLAYERS" ? (selectedPlayers ?? []) : [],
      selectedClubs: battleType === "CLUBS" ? (selectedClubs ?? []) : [],
      invitedFriends: invitedFriends ?? [],
      userId,
      userName: standardizedName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const battleRef = db.collection("fanBattles").doc();
    batch.set(battleRef, newBattle);

    // ── In-app notifications for each invited friend ─────────────────────────
    if (invitedFriends && invitedFriends.length > 0) {
      for (const friend of invitedFriends) {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          type: "BATTLE_INVITE",
          recipientEmail: friend.email,
          senderName: standardizedName,
          senderId: userId,
          battleId: battleRef.id,
          battleName: battleName.trim(),
          battleType,
          message: `${standardizedName} has invited you to a Fan Battle!`,
          isRead: false,
          createdAt: Date.now(),
        });
      }
    }

    await batch.commit();

    // ── Award points for creating a battle (via shared utility) ──────────────
    // transactionId uses battleRef.id so creating the same battle twice
    // (e.g. double submit) never double-awards points.
    const pointsAwarded = 10;
    const userSnap = await db.collection("users").doc(userId).get();
    const userExists = userSnap.exists;

    // If the user doc doesn't exist yet, create it first so awardUserPoints
    // can update it — mirrors the original behaviour of this route.
    if (!userExists) {
      await db.collection("users").doc(userId).set({
        userId,
        email: standardizedEmail,
        name: standardizedName,
        firstName: standardizedName.split(" ")[0] || "",
        lastName: standardizedName.split(" ")[1] || "",
        totalPoints: 0,
        pointsBreakdown: {},
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        status: "active",
        role: "user",
      });
    }

    await awardUserPoints({
      actualUserId: userId,
      userName: standardizedName,
      userEmail: standardizedEmail,
      userExists: true, // either already existed or we just created it above
      points: pointsAwarded,
      reason: "CREATE_BATTLE",
      transactionId: `${userId}_${battleRef.id}_CREATE_BATTLE`,
      metadata: { battleId: battleRef.id },
    });

    // ── Send invite emails AFTER commit so battleRef.id is real ─────────────
    const { sent: emailsSent, failed: emailsFailed } = await sendBattleInviteEmails(
      invitedFriends ?? [],
      battleName.trim(),
      battleType,
      battleRef.id,
      standardizedName
    );

    console.log(
      `✅ Battle created: ${battleRef.id} | Emails sent: ${emailsSent} | Failed: ${emailsFailed.length}`
    );

    return NextResponse.json(
      {
        success: true,
        id: battleRef.id,
        battle: { id: battleRef.id, ...newBattle },
        pointsAwarded,
        message: `Battle created successfully! +${pointsAwarded} points awarded!`,
        invites: {
          sent: emailsSent,
          failed: emailsFailed,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/battles error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET — List battles (with filters + cursor pagination) ────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const battleType = searchParams.get("battleType");
    const userId = searchParams.get("userId");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    let query: FirebaseFirestore.Query = db
      .collection("fanBattles")
      .orderBy("createdAt", "desc");

    if (battleType && ["PLAYERS", "CLUBS"].includes(battleType)) {
      query = query.where("battleType", "==", battleType);
    }

    if (userId) {
      query = query.where("userId", "==", userId);
    }

    query = query.limit(limit);

    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("fanBattles").doc(lastDocId);
      const lastDocSnap = await lastDocRef.get();
      if (lastDocSnap.exists) {
        query = query.startAfter(lastDocSnap);
      }
    }

    const snapshot = await query.get();

    const battles = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      battles,
      pagination: {
        limit,
        hasMore: battles.length === limit,
        nextCursor:
          battles.length === limit
            ? {
                lastDocId: lastDoc?.id,
                lastDocCreatedAt: lastDoc?.data()?.createdAt,
              }
            : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/battles error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}