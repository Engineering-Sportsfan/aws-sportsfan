import * as fs from "fs";
import * as path from "path";

const WATCHALONG_ID = "73e9b219-3481-4e72-8033-a5d1bb64fe41";
const MATCH_ID = "5bdac51d-b21b-4e2a-ba0e-aa81857dbc32";

const reportPath = path.join(process.cwd(), "audit_event_participants_report.json");
const raw = fs.readFileSync(reportPath, "utf-8");
const data = JSON.parse(raw);

const all = data.allParticipants || [];

const filtered: any[] = [];

for (const user of all) {
  const watchalongActivities = (user.activities || []).filter((act: any) => {
    const room = act.roomOrMatch || act.details || "";
    return (
      room.includes(WATCHALONG_ID) ||
      room.includes(MATCH_ID) ||
      (act.type && act.type.includes("WatchAlong"))
    );
  });

  if (watchalongActivities.length > 0) {
    // Specifically check activities for this exact session
    const exactSessionActivities = watchalongActivities.filter((act: any) => {
      const room = act.roomOrMatch || act.details || "";
      return room.includes(WATCHALONG_ID) || room.includes(MATCH_ID);
    });

    filtered.push({
      identifier: user.identifier,
      name: user.name,
      email: user.email,
      username: user.username,
      userId: user.userId,
      inProdDynamo: user.inProdDynamo,
      inDevDynamo: user.inDevDynamo,
      exactSessionActivities: exactSessionActivities.length > 0 ? exactSessionActivities : watchalongActivities,
      allActivitiesInSession: watchalongActivities,
      didNothingExceptJoin: user.didNothingExceptJoin,
    });
  }
}

console.log(`\n================================================================================`);
console.log(`🎯 PARTICIPANTS FOR WATCHALONG: ${WATCHALONG_ID}`);
console.log(`Match ID: ${MATCH_ID}`);
console.log(`Total Found: ${filtered.length}`);
console.log(`================================================================================\n`);

const outputPath = path.join(process.cwd(), "this_watchalong_participants.json");
fs.writeFileSync(outputPath, JSON.stringify(filtered, null, 2), "utf-8");

filtered.forEach((u, i) => {
  console.log(`[${i + 1}] ${u.name || u.username} (${u.email || "No Email"} | ID: ${u.userId})`);
  console.log(`    Status in PROD IdentityAndAccess: ${u.inProdDynamo ? "✅ Present" : "❌ MISSING"}`);
  console.log(`    Status in DEV IdentityAndAccess-dev: ${u.inDevDynamo ? "✅ Present" : "❌ Missing"}`);
  console.log(`    Activities in this WatchAlong:`);
  u.exactSessionActivities.forEach((act: any) => {
    console.log(`      • [${act.timeFormatted || "N/A"}] ${act.type} -> ${act.details || ""}`);
  });
  console.log("");
});
