// Read-only: for engagement-linked ACT# rows, shows where each engagement lives and what match/moment id it carries.
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { docClient } from "../lib/dynamodb";
import { TABLES } from "../lib/tableNames";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const EXCLUDED = new Set(["ROAR_POST","ROAR_DEBATE","ROAR_PREDICTION","ROAR_HOT_TAKE","ROAR_MEMORY","ROAR_RAW_REACTIONS","ROAR_QUIZ"]);
const scored = (t: string) => !!t && !EXCLUDED.has(t.toUpperCase()) && !t.toUpperCase().includes("CREATE");

async function scanAll(table: string, filter?: string, values?: any) {
  const out: any[] = []; let k: any;
  do {
    const r = await docClient.send(new ScanCommand({ TableName: table, FilterExpression: filter, ExpressionAttributeValues: values, ExclusiveStartKey: k }));
    out.push(...(r.Items ?? [])); k = r.LastEvaluatedKey;
  } while (k);
  return out;
}

async function main() {
  const acts = await scanAll(TABLES.GamificationAndWallet, "begins_with(sk, :p)", { ":p": "ACT#" });
  const engIds = new Set<string>();
  for (const a of acts) if (scored(String(a.type)) && Number(a.points) > 0 && a.metadata?.engagementId) engIds.add(String(a.metadata.engagementId));

  // Index MatchMoments loops once (one scan) by id
  const mm = await scanAll(TABLES.MatchMoments, "begins_with(sk, :l)", { ":l": "LOOP#" });
  const mmById = new Map<string, any>();
  for (const m of mm) {
    mmById.set(String(m.sk).replace(/^LOOP#/, ""), m);
    if (m.id) mmById.set(String(m.id), m);
    if (m.loopId) mmById.set(String(m.loopId), m);
  }

  const rows: any[] = [];
  for (const id of engIds) {
    const soc = (await docClient.send(new GetCommand({ TableName: TABLES.SocialAndContent, Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" } }))).Item;
    const m = mmById.get(id);
    rows.push({
      engagementId: id.slice(0, 26),
      inSocial: !!soc,
      social_matchId: soc?.matchId ?? "",
      social_source: soc?.source ?? "",
      inMatchMoments: !!m,
      mm_entityId: m?.entityId ?? "",
      mm_matchId: m?.matchId ?? "",
      mm_loopId: m?.loopId ?? "",
    });
  }
  const summary = {
    engagements: rows.length,
    inSocial: rows.filter(r => r.inSocial).length,
    inSocial_withMatch: rows.filter(r => r.social_matchId).length,
    inMatchMoments: rows.filter(r => r.inMatchMoments).length,
    inMM_notSocialMatch: rows.filter(r => r.inMatchMoments && !r.social_matchId).length,
    inNeither: rows.filter(r => !r.inSocial && !r.inMatchMoments).length,
  };
  console.log(summary);
  console.log("Rows where MatchMoments gives a match but SocialAndContent does not:");
  console.table(rows.filter(r => r.inMatchMoments && !r.social_matchId));
  console.log("Source values seen in SocialAndContent:", [...new Set(rows.map(r => r.social_source))]);
}
main().catch(e => { console.error(e); process.exit(1); });
