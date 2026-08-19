// app/api/post-report/route.ts — Migrated to AWS DynamoDB (SocialAndContent & IdentityAndAccess Tables)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { FieldValue } from "firebase-admin/firestore";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export type ReportReason =
  | "illegal_content"
  | "indecent_content"
  | "irrelevant_content"
  | "misleading_information"
  | "offensive_content";

interface ReportPayload {
  postId: string;
  reporterId: string;
  reporterName?: string;
  reason: ReportReason;
}

const MAX_REPORTS_PER_DAY = 10;
const SAME_AUTHOR_WINDOW_DAYS = 7;
const SAME_AUTHOR_MAX_REPORTS = 3;
const COORDINATED_WINDOW_MS = 30 * 60 * 1000;
const COORDINATED_THRESHOLD = 5;
const LOW_TRUST_DISMISSAL_RATIO = 0.7;
const LOW_TRUST_MIN_REPORTS = 10;
const ABUSE_DISABLE_DISMISSAL_RATIO = 0.8;
const ABUSE_DISABLE_MIN_REPORTS = 15;

const VALID_REASONS: ReportReason[] = [
  "illegal_content",
  "indecent_content",
  "irrelevant_content",
  "misleading_information",
  "offensive_content",
];

const STRIKE_RULES = [
  { strikes: 1, action: "warning", suspendDays: 0 },
  { strikes: 2, action: "suspend_7", suspendDays: 7 },
  { strikes: 3, action: "suspend_30", suspendDays: 30 },
  { strikes: 4, action: "ban", suspendDays: 0 },
];

function getStrikeAction(totalStrikes: number) {
  for (let i = STRIKE_RULES.length - 1; i >= 0; i--) {
    if (totalStrikes >= STRIKE_RULES[i].strikes) return STRIKE_RULES[i];
  }
  return STRIKE_RULES[0];
}

async function getReporterReputation(reporterId: string) {
  if (db) {
    const ref = db.collection("reporterReputation").doc(reporterId);
    const snap = await ref.get();
    if (snap.exists) return { ref, data: snap.data()! };

    const defaults = {
      reporterId,
      totalReports: 0,
      validatedReports: 0,
      dismissedReports: 0,
      trustScore: 1.0,
      reportingDisabled: false,
      disabledAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await ref.set(defaults);
    return { ref, data: defaults };
  }

  const defaults = {
    reporterId,
    totalReports: 0,
    validatedReports: 0,
    dismissedReports: 0,
    trustScore: 1.0,
    reportingDisabled: false,
    disabledAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return { ref: null, data: defaults };
}

async function refreshTrustScore(
  repRef: FirebaseFirestore.DocumentReference | null,
  repData: Record<string, unknown>
) {
  const total = (repData.totalReports as number) || 0;
  const dismissed = (repData.dismissedReports as number) || 0;
  const validated = (repData.validatedReports as number) || 0;
  let trustScore = (repData.trustScore as number) ?? 1.0;
  let reportingDisabled = (repData.reportingDisabled as boolean) ?? false;
  if (total >= LOW_TRUST_MIN_REPORTS) {
    const dismissalRatio = dismissed / total;
    const validationRatio = validated / total;
    trustScore = Math.max(0, Math.min(1, 0.5 + validationRatio * 0.5 - dismissalRatio * 0.5));
    if (total >= ABUSE_DISABLE_MIN_REPORTS && dismissalRatio >= ABUSE_DISABLE_DISMISSAL_RATIO) {
      reportingDisabled = true;
    }
  }

  const updated = { trustScore, reportingDisabled, updatedAt: Date.now() };

  if (repRef) {
    await repRef.update(updated);
  }

  try {
    const repItem = {
      contentId: `REPUTATION#${repData.reporterId}`,
      sk: "REPUTATION#META",
      ...repData,
      ...updated,
    };
    await dualWrite("reporterReputation", repData.reporterId as string, "SocialAndContent", repItem);
  } catch (e) {
    console.warn("[refreshTrustScore] DynamoDB write notice:", e);
  }

  return { trustScore, reportingDisabled };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/post-report
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: ReportPayload = await req.json();
    const { postId, reporterId, reporterName, reason } = body;

    if (!postId || !reporterId || !reason) {
      return NextResponse.json(
        { success: false, error: "postId, reporterId, and reason are required" },
        { status: 400 }
      );
    }
    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { success: false, error: "Invalid report reason" },
        { status: 400 }
      );
    }

    let postAuthorId: string | null = null;
    if (db) {
      const postRef = db.collection("socialPosts").doc(postId);
      const postSnap = await postRef.get();
      if (!postSnap.exists) {
        return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
      }
      postAuthorId = postSnap.data()?.userId ?? null;
    }

    const { ref: repRef, data: repData } = await getReporterReputation(reporterId);

    if (repData.reportingDisabled) {
      return NextResponse.json({
        success: true,
        message: "Report submitted. Thank you for helping keep the community safe.",
        _silenced: true,
      });
    }

    if (db) {
      const dupQuery = await db
        .collection("postReports")
        .where("postId", "==", postId)
        .where("reporterId", "==", reporterId)
        .limit(1)
        .get();
      if (!dupQuery.empty) {
        return NextResponse.json(
          { success: false, error: "You have already reported this post" },
          { status: 409 }
        );
      }
    }

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let isSilencedByRateLimit = false;
    let isSuspiciousAuthorTarget = false;
    let isCoordinated = false;

    if (db) {
      const dailySnap = await db
        .collection("postReports")
        .where("reporterId", "==", reporterId)
        .where("createdAt", ">", oneDayAgo)
        .get();
      isSilencedByRateLimit = dailySnap.size >= MAX_REPORTS_PER_DAY;

      const windowStart = Date.now() - SAME_AUTHOR_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      if (postAuthorId) {
        const sameAuthorSnap = await db
          .collection("postReports")
          .where("reporterId", "==", reporterId)
          .where("postAuthorId", "==", postAuthorId)
          .where("createdAt", ">", windowStart)
          .get();
        isSuspiciousAuthorTarget = sameAuthorSnap.size >= SAME_AUTHOR_MAX_REPORTS;
      }

      const coordWindowStart = Date.now() - COORDINATED_WINDOW_MS;
      const coordSnap = await db
        .collection("postReports")
        .where("postId", "==", postId)
        .where("createdAt", ">", coordWindowStart)
        .get();
      isCoordinated = coordSnap.size >= COORDINATED_THRESHOLD;
    }

    const trustScore = (repData.trustScore as number) ?? 1.0;
    const isLowTrust =
      ((repData.totalReports as number) || 0) >= LOW_TRUST_MIN_REPORTS &&
      trustScore < 1 - LOW_TRUST_DISMISSAL_RATIO;

    let status: "pending" | "silenced" | "flagged_coordinated" | "low_trust_review";
    if (isSilencedByRateLimit) {
      status = "silenced";
    } else if (isCoordinated) {
      status = "flagged_coordinated";
    } else if (isSuspiciousAuthorTarget || isLowTrust) {
      status = "low_trust_review";
    } else {
      status = "pending";
    }

    const now = Date.now();
    const id = `report_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const reportDoc = {
      id,
      postId,
      postAuthorId,
      reporterId,
      reporterName: reporterName || "Anonymous",
      reason,
      status,
      trustScoreAtSubmission: trustScore,
      abuseFlags: {
        rateLimited: isSilencedByRateLimit,
        suspiciousAuthorTarget: isSuspiciousAuthorTarget,
        coordinated: isCoordinated,
        lowTrust: isLowTrust,
      },
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      contentId: `REPORT#${id}`,
      sk: `POST#${postId}#REPORTER#${reporterId}`,
      ...reportDoc,
    };

    await dualWrite("postReports", id, "SocialAndContent", dynamoItem);

    if (repRef) {
      await repRef.update({
        totalReports: FieldValue.increment(1),
        updatedAt: now,
      });
      const updatedRepSnap = await repRef.get();
      await refreshTrustScore(repRef, updatedRepSnap.data()!);
    }

    if ((status === "pending" || status === "flagged_coordinated") && db) {
      const postRef = db.collection("socialPosts").doc(postId);
      await postRef.update({
        reportCount: FieldValue.increment(1),
        updatedAt: now,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: reportDoc,
        message: "Report submitted. Thank you for helping keep the community safe.",
      },
      { status: 201 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/post-report error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/post-report — Admin: resolve a report
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const { reportId, resolution, adminId, adminNote } = await req.json();

    if (!reportId || !resolution || !adminId) {
      return NextResponse.json(
        { success: false, error: "reportId, resolution, and adminId are required" },
        { status: 400 }
      );
    }
    if (resolution !== "validated" && resolution !== "dismissed") {
      return NextResponse.json(
        { success: false, error: "resolution must be 'validated' or 'dismissed'" },
        { status: 400 }
      );
    }

    let reportData: Record<string, unknown> = {};

    if (db) {
      const reportRef = db.collection("postReports").doc(reportId);
      const reportSnap = await reportRef.get();
      if (reportSnap.exists) {
        reportData = reportSnap.data()!;
      }
    }

    const postId = (reportData.postId as string) || "";
    const postAuthorId = (reportData.postAuthorId as string | null) || null;
    const reporterId = (reportData.reporterId as string) || "";
    const now = Date.now();

    const reportUpdate = {
      status: resolution === "validated" ? "actioned" : "dismissed",
      resolvedBy: adminId,
      resolvedAt: now,
      adminNote: adminNote ?? null,
      updatedAt: now,
    };

    const dynamoItem = {
      contentId: `REPORT#${reportId}`,
      sk: `POST#${postId || "UNKNOWN"}#REPORTER#${reporterId || "UNKNOWN"}`,
      ...reportData,
      ...reportUpdate,
    };

    await dualWrite("postReports", reportId, "SocialAndContent", dynamoItem);

    if (resolution === "validated" && db && postId) {
      const siblingSnap = await db
        .collection("postReports")
        .where("postId", "==", postId)
        .where("status", "in", ["pending", "flagged_coordinated", "low_trust_review"])
        .get();

      const batch = db.batch();
      siblingSnap.docs.forEach((doc) => {
        if (doc.id !== reportId) {
          batch.update(doc.ref, {
            status: "actioned",
            resolvedBy: adminId,
            resolvedAt: now,
            adminNote: "Auto-closed: same post actioned",
            updatedAt: now,
          });
        }
      });
      await batch.commit();
    }

    let trustScore = 1.0;
    let reportingDisabled = false;
    if (reporterId) {
      const { ref: repRef } = await getReporterReputation(reporterId);
      const field = resolution === "validated" ? "validatedReports" : "dismissedReports";
      if (repRef) {
        await repRef.update({ [field]: FieldValue.increment(1), updatedAt: now });
        const updatedRepSnap = await repRef.get();
        const res = await refreshTrustScore(repRef, updatedRepSnap.data()!);
        trustScore = res.trustScore;
        reportingDisabled = res.reportingDisabled;
      }
    }

    let strikeResult: Record<string, unknown> | null = null;
    if (resolution === "validated" && postId) {
      if (db) {
        const postRef = db.collection("socialPosts").doc(postId);
        await postRef.update({
          removed: true,
          removedAt: now,
          removedBy: adminId,
          removedReason: reportData.reason ?? "policy_violation",
          updatedAt: now,
        });
      }

      if (postAuthorId) {
        strikeResult = await applyStrike({
          authorId: postAuthorId,
          postId,
          reportId,
          adminId,
          reason: (reportData.reason as string) || "policy_violation",
          adminNote: adminNote ?? null,
          now,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message:
        resolution === "validated"
          ? "Post removed, author struck, all related reports closed."
          : "Report dismissed.",
      reporterTrustScore: trustScore,
      reporterReportingStatus: reportingDisabled ? "disabled" : "active",
      strikeResult,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/post-report error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// applyStrike
// ─────────────────────────────────────────────────────────────────────────────
async function applyStrike(params: {
  authorId: string;
  postId: string;
  reportId: string;
  adminId: string;
  reason: string;
  adminNote: string | null;
  now: number;
}) {
  const { authorId, postId, reportId, adminId, reason, adminNote, now } = params;

  let currentStrikes = 1;
  let userData: Record<string, unknown> = {};

  if (db) {
    const userRef = db.collection("users").doc(authorId);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      userData = userSnap.data()!;
      currentStrikes = ((userData.warningCount as number) ?? 0) + 1;
    }
  }

  const rule = getStrikeAction(currentStrikes);

  const userUpdate: Record<string, unknown> = {
    warningCount: currentStrikes,
    lastStrikeAt: now,
    updatedAt: now,
  };

  if (rule.action === "ban") {
    userUpdate.status = "disabled";
    userUpdate.bannedAt = now;
    userUpdate.bannedBy = adminId;
    userUpdate.bannedReason = reason;
  } else if (rule.action.startsWith("suspend")) {
    const suspendUntil = now + rule.suspendDays * 24 * 60 * 60 * 1000;
    userUpdate.status = "suspended";
    userUpdate.suspendedAt = now;
    userUpdate.suspendedBy = adminId;
    userUpdate.suspendedUntil = suspendUntil;
    userUpdate.suspendReason = reason;
  }

  const userDynamoItem = {
    entityId: `USER#${authorId}`,
    sk: `USER#${authorId}`,
    ...userData,
    ...userUpdate,
  };

  await dualWrite("users", authorId, "IdentityAndAccess", userDynamoItem);

  const strikeId = `strike_${now}_${Math.random().toString(36).substring(2, 9)}`;
  const strikeDoc = {
    id: strikeId,
    authorId,
    postId,
    reportId,
    adminId,
    reason,
    adminNote,
    strikeNumber: currentStrikes,
    actionTaken: rule.action,
    suspendDays: rule.suspendDays,
    createdAt: now,
  };

  const strikeDynamoItem = {
    contentId: `STRIKE#${strikeId}`,
    sk: `USER#${authorId}`,
    ...strikeDoc,
  };

  await dualWrite("userStrikes", strikeId, "SocialAndContent", strikeDynamoItem);

  return {
    strikeId,
    strikeNumber: currentStrikes,
    actionTaken: rule.action,
    suspendDays: rule.suspendDays,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/post-report
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get("postId");
    const reporterId = searchParams.get("reporterId");
    const status = searchParams.get("status");

    let reports: any[] = [];

    // 1. Scan DynamoDB
    try {
      let filterExpr = "begins_with(contentId, :prefix)";
      const exprVals: Record<string, any> = {
        ":prefix": "REPORT#",
      };

      if (postId) {
        filterExpr += " AND postId = :pId";
        exprVals[":pId"] = postId;
      }
      if (reporterId) {
        filterExpr += " AND reporterId = :rId";
        exprVals[":rId"] = reporterId;
      }
      if (status) {
        filterExpr += " AND #st = :status";
        exprVals[":status"] = status;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: filterExpr,
          ExpressionAttributeNames: status ? { "#st": "status" } : undefined,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        reports = scanRes.Items.map((item) => ({
          id: item.id || (item.contentId as string).replace(/^REPORT#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[post-report GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (reports.length === 0 && db) {
      let query = db.collection("postReports").orderBy("createdAt", "desc") as FirebaseFirestore.Query;

      if (postId) query = query.where("postId", "==", postId);
      if (reporterId) query = query.where("reporterId", "==", reporterId);
      if (status) query = query.where("status", "==", status);

      const snapshot = await query.limit(100).get();
      reports = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    reports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ success: true, reports, total: reports.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}