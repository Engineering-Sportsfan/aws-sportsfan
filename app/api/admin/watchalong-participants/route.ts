// app/api/admin/watchalong-participants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const TARGET_WATCHALONG_ID = "73e9b219-3481-4e72-8033-a5d1bb64fe41";
const TARGET_MATCH_ID = "5bdac51d-b21b-4e2a-ba0e-aa81857dbc32";
const TARGET_EVENT_TITLE = "Indian Athletics Final Series";

export async function GET(req: NextRequest) {
  try {
    const reportPath = path.join(process.cwd(), "audit_event_participants_report.json");
    if (!fs.existsSync(reportPath)) {
      return NextResponse.json({ error: "audit_event_participants_report.json not found. Please run audit first." }, { status: 404 });
    }

    const raw = fs.readFileSync(reportPath, "utf-8");
    const data = JSON.parse(raw);
    const all = data.allParticipants || [];

    // Filter users who joined or interacted with this specific WatchAlong session
    const watchAlongUsers: any[] = [];

    for (const user of all) {
      const matchActivities = (user.activities || []).filter((act: any) => {
        const text = `${act.roomOrMatch || ""} ${act.details || ""}`;
        return text.includes(TARGET_WATCHALONG_ID) || text.includes(TARGET_MATCH_ID);
      });

      // Also check if they had auth issues during event time on 10/9/2026 (approx 1789030000000 - 1789045000000)
      const eventWindowAuthIssues = (user.activities || []).filter((act: any) => {
        const ts = act.timestamp || 0;
        return (
          act.type === "Auth Issue Recorded" &&
          ts >= 1789033200000 && // ~3:00 PM IST 10/9/2026
          ts <= 1789044000000    // ~6:00 PM IST 10/9/2026
        );
      });

      if (matchActivities.length > 0 || eventWindowAuthIssues.length > 0) {
        const sessionActivities = [...matchActivities, ...eventWindowAuthIssues];
        const activeInteractions = sessionActivities.filter(
          (a) => a.type.includes("Chatted") || a.type.includes("Voted") || a.type.includes("Answered") || a.type.includes("Posted")
        );
        const hasJoined = sessionActivities.some((a) => a.type.includes("Joined"));
        const didNothing = hasJoined && activeInteractions.length === 0;

        watchAlongUsers.push({
          identifier: user.identifier,
          name: user.name || user.username,
          email: user.email,
          username: user.username,
          userId: user.userId,
          inProdDynamo: user.inProdDynamo,
          inDevDynamo: user.inDevDynamo,
          didNothingExceptJoin: didNothing,
          joinedSession: hasJoined,
          hitAuthIssueDuringEvent: eventWindowAuthIssues.length > 0,
          activities: sessionActivities,
          firstSeen: sessionActivities[sessionActivities.length - 1]?.timeFormatted || user.firstSeen,
          lastSeen: sessionActivities[0]?.timeFormatted || user.lastSeen,
        });
      }
    }

    const missingFromProd = watchAlongUsers.filter((u) => !u.inProdDynamo);
    const missingFromDev = watchAlongUsers.filter((u) => !u.inDevDynamo);

    const result = {
      success: true,
      event: {
        title: TARGET_EVENT_TITLE,
        watchalongId: TARGET_WATCHALONG_ID,
        matchId: TARGET_MATCH_ID,
      },
      summary: {
        totalWatchAlongParticipants: watchAlongUsers.length,
        joinedAndDidNothingCount: watchAlongUsers.filter((u) => u.didNothingExceptJoin).length,
        missingFromProdCount: missingFromProd.length,
        missingFromDevCount: missingFromDev.length,
      },
      missingFromProd,
      allWatchAlongParticipants: watchAlongUsers,
    };

    // Save dedicated JSON file
    const outputPath = path.join(process.cwd(), "watchalong_participants_result.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

    // If browser, return HTML table
    const acceptHeader = req.headers.get("accept") || "";
    if (acceptHeader.includes("text/html") && req.nextUrl.searchParams.get("format") !== "json") {
      return new NextResponse(renderWatchAlongHtml(result), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Watchalong participants error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

function renderWatchAlongHtml(data: any) {
  const users = data.allWatchAlongParticipants;
  const summary = data.summary;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WatchAlong Participants — ${data.event.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .header { border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0; color: #38bdf8; font-size: 22px; }
    .meta { color: #94a3b8; font-size: 13px; margin-top: 6px; }
    .summary-grid { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 14px 20px; text-align: center; min-width: 160px; }
    .card.alert { border-color: #ef4444; background: #450a0a; }
    .card .val { font-size: 26px; font-weight: bold; margin-top: 4px; }
    .card .lbl { font-size: 12px; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; font-size: 14px; }
    th { background: #0b1120; color: #94a3b8; text-align: left; padding: 12px 16px; border-bottom: 1px solid #334155; }
    td { padding: 12px 16px; border-bottom: 1px solid #334155; vertical-align: top; }
    tr:hover td { background: #243248; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin-right: 4px; }
    .badge-missing { background: #ef4444; color: #fff; }
    .badge-present { background: #22c55e; color: #fff; }
    .badge-nothing { background: #64748b; color: #fff; }
    .badge-auth { background: #f59e0b; color: #000; }
    .badge-active { background: #3b82f6; color: #fff; }
    .activity-row { font-size: 12px; color: #cbd5e1; margin-bottom: 4px; }
    .time { color: #94a3b8; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏟️ ${data.event.title} — WatchAlong Participants</h1>
    <div class="meta">
      <strong>WatchAlong ID:</strong> ${data.event.watchalongId} &nbsp;|&nbsp; <strong>Match ID:</strong> ${data.event.matchId}
    </div>
  </div>

  <div class="summary-grid">
    <div class="card">
      <div class="lbl">Total Participants in this WatchAlong</div>
      <div class="val">${summary.totalWatchAlongParticipants}</div>
    </div>
    <div class="card alert">
      <div class="lbl">Missing from PROD Database</div>
      <div class="val" style="color: #f87171;">${summary.missingFromProdCount}</div>
    </div>
    <div class="card">
      <div class="lbl">Joined & Did Nothing</div>
      <div class="val" style="color: #94a3b8;">${summary.joinedAndDidNothingCount}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Participant</th>
        <th>PROD DB Status</th>
        <th>DEV DB Status</th>
        <th>What They Did in this Event</th>
        <th>Activity Timestamp</th>
      </tr>
    </thead>
    <tbody>
      ${users
        .map(
          (u: any) => `<tr>
        <td>
          <strong style="font-size: 15px;">${u.name}</strong><br>
          <span style="color: #38bdf8;">${u.email || "No Email"}</span><br>
          <span style="color: #94a3b8; font-size: 12px;">@${u.username} (ID: ${u.userId})</span>
        </td>
        <td>
          ${
            u.inProdDynamo
              ? '<span class="badge badge-present">✓ In Prod DB</span>'
              : '<span class="badge badge-missing">✗ MISSING FROM PROD</span>'
          }
        </td>
        <td>
          ${
            u.inDevDynamo
              ? '<span class="badge badge-present">✓ In Dev DB</span>'
              : '<span class="badge badge-missing">✗ Missing from Dev</span>'
          }
        </td>
        <td>
          ${u.didNothingExceptJoin ? '<span class="badge badge-nothing">Joined (Did Nothing)</span> ' : ""}
          ${u.hitAuthIssueDuringEvent ? '<span class="badge badge-auth">⚠️ Hit Auth Issue</span> ' : ""}
          ${!u.didNothingExceptJoin && !u.hitAuthIssueDuringEvent ? '<span class="badge badge-active">Active</span>' : ""}
          <div style="margin-top: 8px;">
            ${u.activities
              .map(
                (a: any) =>
                  `<div class="activity-row">• <strong>${a.type}:</strong> ${a.details || ""} <span class="time">(${a.timeFormatted || ""})</span></div>`
              )
              .join("")}
          </div>
        </td>
        <td>
          <span class="time">First Seen:</span><br>
          <strong>${u.firstSeen || "N/A"}</strong><br><br>
          <span class="time">Last Seen:</span><br>
          <strong>${u.lastSeen || "N/A"}</strong>
        </td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>
</body>
</html>`;
}
