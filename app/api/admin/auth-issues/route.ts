// app/api/admin/auth-issues/route.ts — Admin API for fetching, filtering, and resolving Login/Signup/OTP issues
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get("type"); // "login" | "signup" | "otp" | "all"
    const statusFilter = searchParams.get("status"); // "pending" | "resolved" | "all"

    // 1. Scan DynamoDB IdentityAndAccess for AUTH_ISSUE# entities
    let issues: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    try {
      do {
        const scanRes: any = await docClient.send(
          new ScanCommand({
            TableName: "IdentityAndAccess",
            FilterExpression: "begins_with(entityId, :prefix)",
            ExpressionAttributeValues: {
              ":prefix": "AUTH_ISSUE#",
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          issues.push(...scanRes.Items);
        }
        lastEvaluatedKey = scanRes.LastEvaluatedKey;
      } while (lastEvaluatedKey);
    } catch (err: any) {
      console.warn("DynamoDB scan auth issues notice:", err?.message || err);
    }

    // 2. Fallback / merge from Firebase 'auth_issues'
    try {
      const fbSnap = await db.collection("auth_issues").orderBy("timestamp", "desc").limit(200).get();
      const fbIssues: any[] = fbSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));

      // Merge unique by issueId or (email + timestamp)
      const existingIds = new Set(issues.map((i: any) => i.issueId || `${i.email}_${i.timestamp}`));
      fbIssues.forEach((fb: any) => {
        const key = fb.issueId || `${fb.email}_${fb.timestamp}`;
        if (!existingIds.has(key)) {
          issues.push(fb);
          existingIds.add(key);
        }
      });
    } catch (fbErr: any) {
      console.warn("Firebase auth issues fallback notice:", fbErr?.message || fbErr);
    }

    // 3. Format and filter
    let formatted = issues.map(item => ({
      entityId: item.entityId,
      sk: item.sk,
      issueId: item.issueId || `ISSUE_${item.timestamp || Date.now()}`,
      email: item.email || "unknown",
      type: item.type || "login",
      reason: item.reason || "Unspecified error",
      endpoint: item.endpoint || "/api/auth",
      ip: item.ip || "unknown",
      status: item.status || "pending",
      timestamp: item.timestamp || item.createdAt || Date.now(),
      metadata: item.metadata || {},
    }));

    if (typeFilter && typeFilter !== "all") {
      formatted = formatted.filter(i => i.type.toLowerCase() === typeFilter.toLowerCase());
    }

    if (statusFilter && statusFilter !== "all") {
      formatted = formatted.filter(i => (i.status || "pending").toLowerCase() === statusFilter.toLowerCase());
    }

    // Sort descending (newest issues first)
    formatted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const totalLoginIssues = formatted.filter(i => i.type === "login").length;
    const totalSignupIssues = formatted.filter(i => i.type === "signup").length;
    const totalOtpIssues = formatted.filter(i => i.type === "otp").length;
    const totalPending = formatted.filter(i => (i.status || "pending") === "pending").length;

    return NextResponse.json(
      {
        issues: formatted,
        total: formatted.length,
        stats: {
          total: formatted.length,
          login: totalLoginIssues,
          signup: totalSignupIssues,
          otp: totalOtpIssues,
          pending: totalPending,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: unknown) {
    console.error("GET /api/admin/auth-issues error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch auth issues";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { issueId, entityId, sk, status } = await req.json();

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 });
    }

    // Update in DynamoDB if keys provided
    if (entityId && sk) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId, sk },
            UpdateExpression: "SET #st = :s, resolvedAt = :ra",
            ExpressionAttributeNames: { "#st": "status" },
            ExpressionAttributeValues: {
              ":s": status,
              ":ra": Date.now(),
            },
          })
        );
      } catch (err: any) {
        console.warn("DynamoDB update issue status notice:", err?.message || err);
      }
    }

    // Update in Firebase
    if (issueId) {
      try {
        await db.collection("auth_issues").doc(issueId).update({
          status,
          resolvedAt: Date.now(),
        });
      } catch (fbErr: any) {
        console.warn("Firebase update issue status notice:", fbErr?.message || fbErr);
      }
    }

    return NextResponse.json({ success: true, message: `Issue marked as ${status}` });
  } catch (error: unknown) {
    console.error("PATCH /api/admin/auth-issues error:", error);
    const msg = error instanceof Error ? error.message : "Failed to update auth issue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { issueId, entityId, sk, deleteAll } = await req.json();

    if (deleteAll) {
      // Clear logs from DynamoDB & Firebase
      const scanRes: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :prefix)",
          ExpressionAttributeValues: { ":prefix": "AUTH_ISSUE#" },
        })
      );
      if (scanRes.Items) {
        await Promise.all(
          scanRes.Items.map((it: any) =>
            docClient.send(
              new DeleteCommand({
                TableName: "IdentityAndAccess",
                Key: { entityId: it.entityId, sk: it.sk },
              })
            )
          )
        );
      }
      const fbSnap = await db.collection("auth_issues").get();
      await Promise.all(fbSnap.docs.map(d => d.ref.delete()));
      return NextResponse.json({ success: true, message: "All auth issue logs deleted" });
    }

    if (entityId && sk) {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId, sk },
        })
      );
    }

    if (issueId) {
      await db.collection("auth_issues").doc(issueId).delete().catch(() => {});
    }

    return NextResponse.json({ success: true, message: "Issue log deleted" });
  } catch (error: unknown) {
    console.error("DELETE /api/admin/auth-issues error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete auth issue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
