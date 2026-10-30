// app/api/visible-recognition/participants/route.ts
// Returns the actual participated fans who voted in engagements for a given match moment,
// fully enriched with their actual name, actual email, and profile image.
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { QueryCommand, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getCandidateTableNames } from "@/lib/dualWrite";

export const dynamic = "force-dynamic";

export interface ParticipantUserItem {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  userEmail?: string | null;
  engagementId: string;
  engagementTitle: string;
  engagementType: string;
  selectedOptionId: string;
  selectedOptionLabel: string;
  votedAt: number;
  isWinner?: boolean;
}

function formatActualName(rawName?: string | null, email?: string | null, userId?: string | null): string {
  if (rawName && rawName.trim() && !rawName.toLowerCase().startsWith("fan_") && rawName.toLowerCase() !== "fan") {
    return rawName.trim();
  }
  const emailPart = (email || userId || "").split("@")[0].replace(/^USER#/i, "");
  if (emailPart) {
    const words = emailPart.replace(/[._-]/g, " ").trim().split(/\s+/);
    if (words.length > 0 && words[0]) {
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
  }
  return "Sports Fan";
}

function resolveEmail(rawEmail?: string | null, userId?: string | null): string | null {
  if (rawEmail && rawEmail.includes("@")) return rawEmail.trim().toLowerCase();
  const uid = String(userId || "").replace(/^USER#/i, "").trim().toLowerCase();
  if (uid.includes("@")) return uid;
  if (uid.includes("_sportsfan360_com")) {
    return uid.replace(/_/g, ".").replace(".sportsfan360.com", "@sportsfan360.com");
  }
  if (uid.includes("_gmail_com")) {
    return uid.replace(/_/g, ".").replace(".gmail.com", "@gmail.com");
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawMatchId = searchParams.get("matchId");
  const rawMomentId = searchParams.get("momentId");
  const engagementIdParam = searchParams.get("engagementId");

  const cleanMatchId = rawMatchId ? rawMatchId.trim().replace(/^MATCH[#-]/i, "") : "";
  const cleanMomentId = rawMomentId ? rawMomentId.trim().replace(/^MOMENT[#-]/i, "") : "";

  try {
    const engagementsMap = new Map<string, any>();
    const allMatchEngagementsMap = new Map<string, any>();

    // 1. Candidate Entity IDs for DynamoDB MatchMoments queries
    const matchIdCandidates = new Set<string>();
    if (rawMatchId) matchIdCandidates.add(rawMatchId.trim());
    if (cleanMatchId) {
      matchIdCandidates.add(cleanMatchId);
      matchIdCandidates.add(`MATCH#${cleanMatchId}`);
      matchIdCandidates.add(`MATCH#MATCH-${cleanMatchId}`);
      matchIdCandidates.add(`MATCH-${cleanMatchId}`);
    }

    const candidateMmTables = getCandidateTableNames("MatchMoments");
    for (const tbl of candidateMmTables) {
      for (const eId of matchIdCandidates) {
        try {
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: tbl,
              KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":eId": eId,
                ":skpfx": "LOOP#",
              },
            })
          );
          if (qRes.Items) {
            for (const item of qRes.Items) {
              const engId = item.id || item.contentId?.replace(/^ENGAGEMENT#/, "") || item.sk?.replace(/^LOOP#/, "");
              if (engId) {
                allMatchEngagementsMap.set(engId, item);
                if (
                  !cleanMomentId ||
                  item.momentId === cleanMomentId ||
                  item.momentId === rawMomentId ||
                  item.momentId === `MM-${cleanMomentId}` ||
                  item.loopId === cleanMomentId
                ) {
                  engagementsMap.set(engId, item);
                }
              }
            }
          }
        } catch {}
      }
    }

    // Also scan SocialAndContent and SocialAndContent-dev for engagements
    const socialTables = getCandidateTableNames("SocialAndContent");
    for (const tbl of socialTables) {
      try {
        const scanEngs = await docClient.send(
          new ScanCommand({
            TableName: tbl,
            FilterExpression: "begins_with(contentId, :engPfx) AND sk = :meta",
            ExpressionAttributeValues: {
              ":engPfx": "ENGAGEMENT#",
              ":meta": "ENGAGEMENT#META",
            },
            Limit: 60,
          })
        );
        if (scanEngs.Items) {
          for (const item of scanEngs.Items) {
            const engId = item.id || item.contentId?.replace(/^ENGAGEMENT#/, "");
            const mId = item.momentId || item.loopId;
            const match = item.matchId;

            const isMatchHit = !cleanMatchId || (match && String(match).replace(/^MATCH[#-]/i, "").toLowerCase() === cleanMatchId.toLowerCase());
            if (engId && isMatchHit) {
              allMatchEngagementsMap.set(engId, item);
              if (
                !cleanMomentId ||
                mId === cleanMomentId ||
                mId === rawMomentId ||
                mId === `MM-${cleanMomentId}`
              ) {
                engagementsMap.set(engId, item);
              }
            }
          }
        }
      } catch {}
    }

    // If specific engagementIdParam was requested, add it
    if (engagementIdParam) {
      engagementsMap.set(engagementIdParam, { id: engagementIdParam, title: "Engagement Loop" });
      allMatchEngagementsMap.set(engagementIdParam, { id: engagementIdParam, title: "Engagement Loop" });
    }

    // If engagementsMap is empty for this specific moment, fall back to all engagements of the match
    const activeEngagementsToQuery = engagementsMap.size > 0 ? engagementsMap : allMatchEngagementsMap;

    const participantsList: ParticipantUserItem[] = [];
    const seenUserMomentKeys = new Set<string>();

    // 2. Query votes across SocialAndContent AND SocialAndContent-dev for these engagements
    for (const [engId, engItem] of activeEngagementsToQuery.entries()) {
      const optionsList = Array.isArray(engItem.options) ? engItem.options : [];
      const optionsMap = new Map<string, string>();
      optionsList.forEach((o: any) => {
        optionsMap.set(String(o.id).trim(), String(o.text || o.label || o.id).trim());
      });

      for (const tbl of socialTables) {
        try {
          const voteRes = await docClient.send(
            new QueryCommand({
              TableName: tbl,
              KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":cid": `ENGAGEMENT#${engId}`,
                ":skpfx": "VOTE#",
              },
            })
          );

          if (voteRes.Items && voteRes.Items.length > 0) {
            for (const v of voteRes.Items) {
              const uid = v.userId || String(v.sk || "").replace(/^VOTE#/, "").split("#")[0];
              if (!uid || uid.toLowerCase().startsWith("anon")) continue;

              const userKey = `${uid}_${engId}`;
              if (seenUserMomentKeys.has(userKey)) continue;
              seenUserMomentKeys.add(userKey);

              const optId = String(v.selectedOptionId || v.choiceId || v.choice || "1").trim();
              const optLabel = optionsMap.get(optId) || v.selectedOptionLabel || v.choiceText || `Option ${optId}`;
              const resolvedEmail = resolveEmail(v.userEmail, uid);
              const actualName = formatActualName(v.userName, resolvedEmail, uid);

              participantsList.push({
                userId: uid,
                userName: actualName,
                userAvatar: v.userAvatar || v.avatarUrl || v.photoURL || null,
                userEmail: resolvedEmail,
                engagementId: engId,
                engagementTitle: engItem.title || "Match Moment Live Question",
                engagementType: engItem.type || "prediction",
                selectedOptionId: optId,
                selectedOptionLabel: optLabel,
                votedAt: v.votedAt || v.timestamp || Date.now(),
                isWinner: Boolean(v.isCorrect || v.wonBonusPoints),
              });
            }
          }
        } catch {}
      }

      // Query Firestore user_engagements
      if (db) {
        try {
          const snap = await db.collection(getFirestoreCollection("user_engagements"))
            .where("engagementId", "==", engId)
            .get();

          for (const d of snap.docs) {
            const v = d.data();
            const uid = v.userId || d.id.split("_")[0];
            if (!uid || uid.toLowerCase().startsWith("anon")) continue;

            const userKey = `${uid}_${engId}`;
            if (seenUserMomentKeys.has(userKey)) continue;
            seenUserMomentKeys.add(userKey);

            const optId = String(v.selectedOptionId || v.choiceId || "1").trim();
            const optLabel = optionsMap.get(optId) || `Option ${optId}`;
            const resolvedEmail = resolveEmail(v.userEmail, uid);
            const actualName = formatActualName(v.userName, resolvedEmail, uid);

            participantsList.push({
              userId: uid,
              userName: actualName,
              userAvatar: v.userAvatar || v.avatarUrl || v.photoURL || null,
              userEmail: resolvedEmail,
              engagementId: engId,
              engagementTitle: engItem.title || "Match Moment Live Question",
              engagementType: engItem.type || "prediction",
              selectedOptionId: optId,
              selectedOptionLabel: optLabel,
              votedAt: v.votedAt || v.timestamp || Date.now(),
              isWinner: Boolean(v.isCorrect || v.pointsAwarded > 0),
            });
          }
        } catch {}
      }
    }

    // 3. Fallback: If still empty, scan SocialAndContent tables directly for recent VOTE# items
    if (participantsList.length === 0) {
      for (const tbl of socialTables) {
        try {
          const scanVotes = await docClient.send(
            new ScanCommand({
              TableName: tbl,
              FilterExpression: "begins_with(sk, :vsk)",
              ExpressionAttributeValues: { ":vsk": "VOTE#" },
              Limit: 25,
            })
          );
          if (scanVotes.Items) {
            for (const v of scanVotes.Items) {
              const uid = v.userId || String(v.sk || "").replace(/^VOTE#/, "").split("#")[0];
              if (!uid || uid.toLowerCase().startsWith("anon") || seenUserMomentKeys.has(uid)) continue;
              seenUserMomentKeys.add(uid);

              const resolvedEmail = resolveEmail(v.userEmail, uid);
              const actualName = formatActualName(v.userName, resolvedEmail, uid);
              const optId = String(v.selectedOptionId || "1").trim();

              participantsList.push({
                userId: uid,
                userName: actualName,
                userAvatar: v.userAvatar || v.avatarUrl || v.photoURL || null,
                userEmail: resolvedEmail,
                engagementId: v.engagementId || v.contentId?.replace(/^ENGAGEMENT#/, "") || "match_vote",
                engagementTitle: "Live Pulse Prediction",
                engagementType: v.type || "prediction",
                selectedOptionId: optId,
                selectedOptionLabel: v.selectedOptionLabel || `Option ${optId}`,
                votedAt: v.votedAt || v.timestamp || Date.now(),
                isWinner: Boolean(v.isCorrect),
              });
            }
          }
        } catch {}
      }
    }

    // 4. USER PROFILE ENRICHMENT: Lookup actual name, email and avatar from IdentityAndAccess
    const identityTables = getCandidateTableNames("IdentityAndAccess");
    const userProfileCache = new Map<string, { name?: string; email?: string; avatar?: string }>();

    for (const p of participantsList) {
      const uKey = p.userId;
      if (!uKey) continue;

      if (!userProfileCache.has(uKey)) {
        let actualName: string | undefined = p.userName;
        let actualEmail: string | undefined = p.userEmail || undefined;
        let actualAvatar: string | undefined = p.userAvatar || undefined;

        const candidateKeys = [
          `USER#${uKey}`,
          uKey,
        ];
        if (actualEmail) {
          candidateKeys.push(`USER#${actualEmail}`);
          candidateKeys.push(actualEmail);
        }

        for (const tbl of identityTables) {
          for (const candId of candidateKeys) {
            try {
              const res = await docClient.send(
                new GetCommand({
                  TableName: tbl,
                  Key: { entityId: candId, sk: "USER#META" },
                })
              );
              if (res.Item) {
                const it = res.Item;
                actualName = it.name || it.displayName || it.username || actualName;
                actualEmail = it.email || actualEmail;
                actualAvatar = it.avatarUrl || it.photoURL || it.profileImage || it.image || it.avatar || actualAvatar;
                break;
              }
            } catch {}
          }
        }

        // Format actual name properly
        const finalName = formatActualName(actualName, actualEmail, uKey);
        const finalEmail = resolveEmail(actualEmail, uKey);

        userProfileCache.set(uKey, {
          name: finalName,
          email: finalEmail || undefined,
          avatar: actualAvatar,
        });
      }

      const prof = userProfileCache.get(uKey);
      if (prof) {
        if (prof.name) p.userName = prof.name;
        if (prof.email) p.userEmail = prof.email;
        if (prof.avatar) p.userAvatar = prof.avatar;
      }
    }

    // Sort newest votes first
    participantsList.sort((a, b) => b.votedAt - a.votedAt);

    return NextResponse.json({
      success: true,
      count: participantsList.length,
      matchId: cleanMatchId,
      momentId: cleanMomentId,
      engagementsCount: activeEngagementsToQuery.size,
      participants: participantsList,
    });
  } catch (err: any) {
    console.error("[participants GET] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch moment participants" },
      { status: 500 }
    );
  }
}
