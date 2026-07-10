// // api/post-report/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";

// export type ReportReason =
//     | "illegal_content"
//     | "indecent_content"
//     | "irrelevant_content"
//     | "misleading_information"
//     | "offensive_content";

// interface ReportPayload {
//     postId: string;
//     reporterId: string;
//     reporterName?: string;
//     reason: ReportReason;
// }

// // ── Constants ─────────────────────────────────────────────────────────────────
// const MAX_REPORTS_PER_DAY           = 10;    // max reports a single user can file per 24h
// const SAME_AUTHOR_WINDOW_DAYS       = 7;     // rolling window for same-author check
// const SAME_AUTHOR_MAX_REPORTS       = 3;     // max reports against one author in that window
// const COORDINATED_WINDOW_MS         = 30 * 60 * 1000; // 30 min window for coordination check
// const COORDINATED_THRESHOLD         = 5;     // reports in that window = coordinated flag
// const LOW_TRUST_DISMISSAL_RATIO     = 0.70;  // 70%+ dismissals → low trust
// const LOW_TRUST_MIN_REPORTS         = 10;    // need at least this many reports to judge ratio
// const ABUSE_DISABLE_DISMISSAL_RATIO = 0.80;  // 80%+ dismissals → disable reporting ability
// const ABUSE_DISABLE_MIN_REPORTS     = 15;

// const VALID_REASONS: ReportReason[] = [
//     "illegal_content",
//     "indecent_content",
//     "irrelevant_content",
//     "misleading_information",
//     "offensive_content",
// ];

// // ── Helpers ───────────────────────────────────────────────────────────────────

// /** Load or create the reporter's reputation doc */
// async function getReporterReputation(reporterId: string) {
//     const ref = db.collection("reporterReputation").doc(reporterId);
//     const snap = await ref.get();
//     if (snap.exists) return { ref, data: snap.data()! };

//     const defaults = {
//         reporterId,
//         totalReports: 0,
//         validatedReports: 0,
//         dismissedReports: 0,
//         trustScore: 1.0,          // 0.0 – 1.0
//         reportingDisabled: false,
//         disabledAt: null,
//         createdAt: Date.now(),
//         updatedAt: Date.now(),
//     };
//     await ref.set(defaults);
//     return { ref, data: defaults };
// }

// /** Recompute and persist trust score after any update */
// async function refreshTrustScore(
//     repRef: FirebaseFirestore.DocumentReference,
//     repData: Record<string, unknown>
// ) {
//     const total     = (repData.totalReports     as number) || 0;
//     const dismissed = (repData.dismissedReports as number) || 0;
//     const validated = (repData.validatedReports as number) || 0;

//     let trustScore      = repData.trustScore as number ?? 1.0;
//     let reportingDisabled = repData.reportingDisabled as boolean ?? false;

//     if (total >= LOW_TRUST_MIN_REPORTS) {
//         const dismissalRatio = dismissed / total;
//         const validationRatio = validated / total;

//         // Simple weighted score: reward validations, penalise dismissals
//         trustScore = Math.max(0, Math.min(1, 0.5 + validationRatio * 0.5 - dismissalRatio * 0.5));

//         if (total >= ABUSE_DISABLE_MIN_REPORTS && dismissalRatio >= ABUSE_DISABLE_DISMISSAL_RATIO) {
//             reportingDisabled = true;
//         }
//     }

//     await repRef.update({ trustScore, reportingDisabled, updatedAt: Date.now() });
//     return { trustScore, reportingDisabled };
// }

// // ── POST /api/post-report ─────────────────────────────────────────────────────
// export async function POST(req: NextRequest) {
//     try {
//         const body: ReportPayload = await req.json();
//         const { postId, reporterId, reporterName, reason } = body;

//         // ── Basic validation ──────────────────────────────────────────────────
//         if (!postId || !reporterId || !reason) {
//             return NextResponse.json(
//                 { success: false, error: "postId, reporterId, and reason are required" },
//                 { status: 400 }
//             );
//         }
//         if (!VALID_REASONS.includes(reason)) {
//             return NextResponse.json(
//                 { success: false, error: "Invalid report reason" },
//                 { status: 400 }
//             );
//         }

//         // ── Fetch post ────────────────────────────────────────────────────────
//         const postRef  = db.collection("socialPosts").doc(postId);
//         const postSnap = await postRef.get();
//         if (!postSnap.exists) {
//             return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
//         }
//         const postData = postSnap.data()!;
//         const postAuthorId = postData.userId ?? null;

//         // ── Reporter reputation check ─────────────────────────────────────────
//         const { ref: repRef, data: repData } = await getReporterReputation(reporterId);

//         if (repData.reportingDisabled) {
//             // Return 200 so the UI looks normal — never tell abusers they're blocked
//             return NextResponse.json({
//                 success: true,
//                 message: "Report submitted. Thank you for helping keep the community safe.",
//                 _silenced: true,  // internal marker; don't expose to client in production
//             });
//         }

//         // ── Duplicate: same reporter + same post ──────────────────────────────
//         const dupQuery = await db
//             .collection("postReports")
//             .where("postId",     "==", postId)
//             .where("reporterId", "==", reporterId)
//             .limit(1)
//             .get();
//         if (!dupQuery.empty) {
//             return NextResponse.json(
//                 { success: false, error: "You have already reported this post" },
//                 { status: 409 }
//             );
//         }

//         // ── Rate limit: max N reports per 24h per reporter ────────────────────
//         const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
//         const dailySnap = await db
//             .collection("postReports")
//             .where("reporterId", "==", reporterId)
//             .where("createdAt",  ">",  oneDayAgo)
//             .get();

//         const isSilencedByRateLimit = dailySnap.size >= MAX_REPORTS_PER_DAY;

//         // ── Same-author abuse: too many reports against one author ────────────
//         const windowStart = Date.now() - SAME_AUTHOR_WINDOW_DAYS * 24 * 60 * 60 * 1000;
//         let isSuspiciousAuthorTarget = false;
//         if (postAuthorId) {
//             const sameAuthorSnap = await db
//                 .collection("postReports")
//                 .where("reporterId",   "==", reporterId)
//                 .where("postAuthorId", "==", postAuthorId)
//                 .where("createdAt",    ">",  windowStart)
//                 .get();
//             isSuspiciousAuthorTarget = sameAuthorSnap.size >= SAME_AUTHOR_MAX_REPORTS;
//         }

//         // ── Coordinated reporting: many reporters on same post in short window ─
//         const coordWindowStart = Date.now() - COORDINATED_WINDOW_MS;
//         const coordSnap = await db
//             .collection("postReports")
//             .where("postId",    "==", postId)
//             .where("createdAt", ">",  coordWindowStart)
//             .get();
//         const isCoordinated = coordSnap.size >= COORDINATED_THRESHOLD;

//         // ── Trust score influence ─────────────────────────────────────────────
//         const trustScore          = repData.trustScore ?? 1.0;
//         const isLowTrust          =
//             (repData.totalReports as number) >= LOW_TRUST_MIN_REPORTS &&
//             trustScore < (1 - LOW_TRUST_DISMISSAL_RATIO);

//         // ── Determine effective status ────────────────────────────────────────
//         // Silenced reports are saved but never surface to admins as actionable
//         let status: "pending" | "silenced" | "flagged_coordinated" | "low_trust_review";
//         if (isSilencedByRateLimit) {
//             status = "silenced";
//         } else if (isCoordinated) {
//             status = "flagged_coordinated";
//         } else if (isSuspiciousAuthorTarget || isLowTrust) {
//             status = "low_trust_review";
//         } else {
//             status = "pending";
//         }

//         const now = Date.now();
//         const reportDoc = {
//             postId,
//             postAuthorId,
//             reporterId,
//             reporterName:    reporterName || "Anonymous",
//             reason,
//             status,
//             trustScoreAtSubmission: trustScore,
//             abuseFlags: {
//                 rateLimited:           isSilencedByRateLimit,
//                 suspiciousAuthorTarget: isSuspiciousAuthorTarget,
//                 coordinated:           isCoordinated,
//                 lowTrust:              isLowTrust,
//             },
//             createdAt: now,
//             updatedAt: now,
//         };

//         const docRef = await db.collection("postReports").add(reportDoc);

//         // ── Increment reporter's total count & refresh trust score ────────────
//         await repRef.update({
//             totalReports: FieldValue.increment(1),
//             updatedAt:    now,
//         });
//         // Re-read updated data then refresh score
//         const updatedRepSnap = await repRef.get();
//         await refreshTrustScore(repRef, updatedRepSnap.data()!);

//         // ── Increment reportCount on post only for actionable reports ─────────
//         if (status === "pending" || status === "flagged_coordinated") {
//             await postRef.update({
//                 reportCount: FieldValue.increment(1),
//                 updatedAt:   now,
//             });
//         }

//         return NextResponse.json(
//             {
//                 success: true,
//                 data:    { id: docRef.id, ...reportDoc },
//                 message: "Report submitted. Thank you for helping keep the community safe.",
//             },
//             { status: 201 }
//         );
//     } catch (error) {
//         const msg = error instanceof Error ? error.message : "Unexpected error";
//         console.error("POST /api/post-report error:", error);
//         return NextResponse.json({ success: false, error: msg }, { status: 500 });
//     }
// }

// // ── PATCH /api/post-report  — Admin: resolve a report (validated | dismissed) ─
// // Body: { reportId: string, resolution: "validated" | "dismissed", adminId: string }
// export async function PATCH(req: NextRequest) {
//     try {
//         const { reportId, resolution, adminId } = await req.json();

//         if (!reportId || !resolution || !adminId) {
//             return NextResponse.json(
//                 { success: false, error: "reportId, resolution, and adminId are required" },
//                 { status: 400 }
//             );
//         }
//         if (resolution !== "validated" && resolution !== "dismissed") {
//             return NextResponse.json(
//                 { success: false, error: "resolution must be 'validated' or 'dismissed'" },
//                 { status: 400 }
//             );
//         }

//         const reportRef  = db.collection("postReports").doc(reportId);
//         const reportSnap = await reportRef.get();
//         if (!reportSnap.exists) {
//             return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
//         }

//         const reportData = reportSnap.data()!;
//         const reporterId = reportData.reporterId as string;
//         const now        = Date.now();

//         // Update the report document
//         await reportRef.update({
//             status:     resolution === "validated" ? "actioned" : "dismissed",
//             resolvedBy: adminId,
//             resolvedAt: now,
//             updatedAt:  now,
//         });

//         // Update reporter's reputation counters
//         const { ref: repRef } = await getReporterReputation(reporterId);
//         const field = resolution === "validated" ? "validatedReports" : "dismissedReports";
//         await repRef.update({
//             [field]:   FieldValue.increment(1),
//             updatedAt: now,
//         });

//         // Recompute trust score
//         const updatedRepSnap = await repRef.get();
//         const { trustScore, reportingDisabled } = await refreshTrustScore(repRef, updatedRepSnap.data()!);

//         return NextResponse.json({
//             success: true,
//             message: `Report marked as ${resolution}.`,
//             reporterTrustScore:      trustScore,
//             reporterReportingStatus: reportingDisabled ? "disabled" : "active",
//         });
//     } catch (error) {
//         const msg = error instanceof Error ? error.message : "Unexpected error";
//         console.error("PATCH /api/post-report error:", error);
//         return NextResponse.json({ success: false, error: msg }, { status: 500 });
//     }
// }

// // ── GET /api/post-report  — Fetch reports (admin) ────────────────────────────
// export async function GET(req: NextRequest) {
//     try {
//         const { searchParams } = new URL(req.url);
//         const postId     = searchParams.get("postId");
//         const reporterId = searchParams.get("reporterId");
//         const status     = searchParams.get("status");

//         let query = db.collection("postReports").orderBy("createdAt", "desc") as
//             FirebaseFirestore.Query;

//         if (postId)     query = query.where("postId",     "==", postId);
//         if (reporterId) query = query.where("reporterId", "==", reporterId);
//         if (status)     query = query.where("status",     "==", status);

//         const snapshot = await query.limit(100).get();
//         const reports  = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

//         return NextResponse.json({ success: true, reports, total: reports.length });
//     } catch (error) {
//         const msg = error instanceof Error ? error.message : "Unexpected error";
//         console.error("GET /api/post-report error:", error);
//         return NextResponse.json({ success: false, error: msg }, { status: 500 });
//     }
// }








// api/post-report/route.ts  — replace your existing PATCH with this full file
// POST and GET remain unchanged from v2; only PATCH is expanded here.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export type ReportReason =
    | "illegal_content"
    | "indecent_content"
    | "irrelevant_content"
    | "misleading_information"
    | "offensive_content";

// ── Strike thresholds ─────────────────────────────────────────────────────────
const STRIKE_RULES = [
    { strikes: 1, action: "warning",    suspendDays: 0  },
    { strikes: 2, action: "suspend_7",  suspendDays: 7  },
    { strikes: 3, action: "suspend_30", suspendDays: 30 },
    { strikes: 4, action: "ban",        suspendDays: 0  }, // permanent
];

function getStrikeAction(totalStrikes: number) {
    // Find the highest rule that applies
    for (let i = STRIKE_RULES.length - 1; i >= 0; i--) {
        if (totalStrikes >= STRIKE_RULES[i].strikes) return STRIKE_RULES[i];
    }
    return STRIKE_RULES[0];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getReporterReputation(reporterId: string) {
    const ref  = db.collection("reporterReputation").doc(reporterId);
    const snap = await ref.get();
    if (snap.exists) return { ref, data: snap.data()! };
    const defaults = {
        reporterId,
        totalReports: 0, validatedReports: 0, dismissedReports: 0,
        trustScore: 1.0, reportingDisabled: false,
        disabledAt: null, createdAt: Date.now(), updatedAt: Date.now(),
    };
    await ref.set(defaults);
    return { ref, data: defaults };
}

async function refreshTrustScore(
    repRef: FirebaseFirestore.DocumentReference,
    repData: Record<string, unknown>
) {
    const total     = (repData.totalReports     as number) || 0;
    const dismissed = (repData.dismissedReports as number) || 0;
    const validated = (repData.validatedReports as number) || 0;
    let trustScore        = (repData.trustScore as number) ?? 1.0;
    let reportingDisabled = (repData.reportingDisabled as boolean) ?? false;
    if (total >= 10) {
        const dismissalRatio  = dismissed / total;
        const validationRatio = validated / total;
        trustScore = Math.max(0, Math.min(1, 0.5 + validationRatio * 0.5 - dismissalRatio * 0.5));
        if (total >= 15 && dismissalRatio >= 0.80) reportingDisabled = true;
    }
    await repRef.update({ trustScore, reportingDisabled, updatedAt: Date.now() });
    return { trustScore, reportingDisabled };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/post-report
// Body: { reportId, resolution: "validated"|"dismissed", adminId, adminNote? }
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

        // ── 1. Load the report ────────────────────────────────────────────────
        const reportRef  = db.collection("postReports").doc(reportId);
        const reportSnap = await reportRef.get();
        if (!reportSnap.exists) {
            return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
        }
        const reportData  = reportSnap.data()!;
        const postId      = reportData.postId      as string;
        const postAuthorId = reportData.postAuthorId as string | null;
        const reporterId  = reportData.reporterId  as string;
        const now         = Date.now();

        // ── 2. Mark this report resolved ─────────────────────────────────────
        await reportRef.update({
            status:     resolution === "validated" ? "actioned" : "dismissed",
            resolvedBy: adminId,
            resolvedAt: now,
            adminNote:  adminNote ?? null,
            updatedAt:  now,
        });

        // ── 3. Bulk-close all other pending reports for the same post ─────────
        if (resolution === "validated") {
            const siblingSnap = await db
                .collection("postReports")
                .where("postId", "==", postId)
                .where("status", "in", ["pending", "flagged_coordinated", "low_trust_review"])
                .get();

            const batch = db.batch();
            siblingSnap.docs.forEach(doc => {
                if (doc.id !== reportId) {
                    batch.update(doc.ref, {
                        status:     "actioned",
                        resolvedBy: adminId,
                        resolvedAt: now,
                        adminNote:  "Auto-closed: same post actioned",
                        updatedAt:  now,
                    });
                }
            });
            await batch.commit();
        }

        // ── 4. Update reporter reputation ─────────────────────────────────────
        const { ref: repRef } = await getReporterReputation(reporterId);
        const field = resolution === "validated" ? "validatedReports" : "dismissedReports";
        await repRef.update({ [field]: FieldValue.increment(1), updatedAt: now });
        const updatedRepSnap = await repRef.get();
        const { trustScore, reportingDisabled } = await refreshTrustScore(repRef, updatedRepSnap.data()!);

        // ── 5. If validated: act on the post + strike the author ──────────────
        let strikeResult: Record<string, unknown> | null = null;

        if (resolution === "validated" && postId) {
            // 5a. Soft-remove the post — hide from feed, preserve for audit
            const postRef = db.collection("socialPosts").doc(postId);
            await postRef.update({
                removed:       true,
                removedAt:     now,
                removedBy:     adminId,
                removedReason: reportData.reason ?? "policy_violation",
                updatedAt:     now,
            });

            // 5b. Strike the author
            if (postAuthorId) {
                strikeResult = await applyStrike({
                    authorId:  postAuthorId,
                    postId,
                    reportId,
                    adminId,
                    reason:    reportData.reason as string,
                    adminNote: adminNote ?? null,
                    now,
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: resolution === "validated"
                ? "Post removed, author struck, all related reports closed."
                : "Report dismissed.",
            reporterTrustScore:       trustScore,
            reporterReportingStatus:  reportingDisabled ? "disabled" : "active",
            strikeResult,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("PATCH /api/post-report error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// applyStrike — increments warningCount, suspends or bans author as needed
// ─────────────────────────────────────────────────────────────────────────────
async function applyStrike(params: {
    authorId:  string;
    postId:    string;
    reportId:  string;
    adminId:   string;
    reason:    string;
    adminNote: string | null;
    now:       number;
}) {
    const { authorId, postId, reportId, adminId, reason, adminNote, now } = params;

    const userRef  = db.collection("users").doc(authorId);
    const userSnap = await userRef.get();

    // Gracefully handle missing user doc
    const userData       = userSnap.exists ? userSnap.data()! : {};
    const currentStrikes = (userData.warningCount ?? 0) + 1;
    const rule           = getStrikeAction(currentStrikes);

    // Build the user update
    const userUpdate: Record<string, unknown> = {
        warningCount: FieldValue.increment(1),
        lastStrikeAt: now,
        updatedAt:    now,
    };

    if (rule.action === "ban") {
        userUpdate.status        = "disabled";
        userUpdate.bannedAt      = now;
        userUpdate.bannedBy      = adminId;
        userUpdate.bannedReason  = reason;
    } else if (rule.action.startsWith("suspend")) {
        const suspendUntil       = now + rule.suspendDays * 24 * 60 * 60 * 1000;
        userUpdate.status        = "suspended";
        userUpdate.suspendedAt   = now;
        userUpdate.suspendedBy   = adminId;
        userUpdate.suspendedUntil = suspendUntil;
        userUpdate.suspendReason = reason;
    }
    // "warning" → no status change, just warningCount increment

    if (userSnap.exists) {
        await userRef.update(userUpdate);
    } else {
        // Author doc doesn't exist yet — create a minimal one
        await userRef.set({ userId: authorId, ...userUpdate, createdAt: now });
    }

    // Write strike record to audit log
    const strikeDoc = {
        authorId,
        postId,
        reportId,
        adminId,
        reason,
        adminNote,
        strikeNumber: currentStrikes,
        actionTaken:  rule.action,
        suspendDays:  rule.suspendDays,
        createdAt:    now,
    };
    const strikeRef = await db.collection("userStrikes").add(strikeDoc);

    return {
        strikeId:     strikeRef.id,
        strikeNumber: currentStrikes,
        actionTaken:  rule.action,
        suspendDays:  rule.suspendDays,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/post-report
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const postId     = searchParams.get("postId");
        const reporterId = searchParams.get("reporterId");
        const status     = searchParams.get("status");

        let query = db.collection("postReports").orderBy("createdAt", "desc") as
            FirebaseFirestore.Query;

        if (postId)     query = query.where("postId",     "==", postId);
        if (reporterId) query = query.where("reporterId", "==", reporterId);
        if (status)     query = query.where("status",     "==", status);

        const snapshot = await query.limit(100).get();
        const reports  = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return NextResponse.json({ success: true, reports, total: reports.length });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}