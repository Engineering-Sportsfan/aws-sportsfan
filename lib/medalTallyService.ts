import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES, getFirestoreCollection, getEnv } from "@/lib/tableNames";
import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export interface MedalTallyData {
  id: string; // e.g. "current" or "medal_tally_current"
  country: string; // e.g. "India"
  countryCode?: string; // e.g. "IN"
  flag: string; // emoji e.g. "🇮🇳"
  flagUrl?: string; // image url e.g. "https://flagcdn.com/w80/in.png"
  label: string; // e.g. "INDIA TODAY"
  events: number; // e.g. 18
  eventsLabel?: string; // e.g. "18 Events"
  gold: number; // e.g. 7
  silver: number; // e.g. 5
  bronze: number; // e.g. 11
  total: number; // e.g. 23 (gold + silver + bronze)
  worldRank: number | string; // e.g. 3 or "#3"
  rankLabel?: string; // e.g. "India Rank" or "World Rank"
  competition?: string; // e.g. "Asian Games"
  active: boolean; // default true
  env?: string;
  tableName?: string; // e.g. "SportsData-dev" | "SportsData-release" | "SportsData"
  updatedAt: number; // epoch ms
  updatedAtIST?: string; // e.g. "29 Sep 2026, 01:54 PM IST"
  updatedBy?: string; // admin email
}

export function formatISTTimestamp(ms: number = Date.now()): string {
  try {
    const formatted = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date(ms));
    return `${formatted} IST`;
  } catch {
    return new Date(ms).toISOString();
  }
}

// In-memory fallback
let cachedMedalTally: MedalTallyData | null = null;

const DEFAULT_MEDAL_TALLY: MedalTallyData = {
  id: "current",
  country: "India",
  countryCode: "IN",
  flag: "🇮🇳",
  flagUrl: "https://flagcdn.com/w80/in.png",
  label: "INDIA TODAY",
  events: 18,
  eventsLabel: "18 Events",
  gold: 7,
  silver: 5,
  bronze: 11,
  total: 23,
  worldRank: 3,
  rankLabel: "India Rank",
  competition: "Asian Games",
  active: true,
  env: getEnv(),
  tableName: TABLES.SportsData,
  updatedAt: Date.now(),
  updatedAtIST: formatISTTimestamp(Date.now()),
  updatedBy: "System",
};

/**
 * Fetch medal tally for the current environment
 * (reads from TABLES.SportsData, falling back to candidate tables & Firestore)
 */
export async function getMedalTally(): Promise<MedalTallyData> {
  const currentEnv = getEnv();
  const currentTable = TABLES.SportsData;

  // 1. Fetch from DynamoDB SportsData (with candidate table fallback)
  const candidateTables = getCandidateTableNames(currentTable);
  for (const table of candidateTables) {
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: {
            entityId: "MEDAL_TALLY#CURRENT",
            sk: "MEDAL_TALLY#META",
          },
        })
      );

      if (res.Item) {
        const it = res.Item;
        const data: MedalTallyData = {
          id: it.id || "current",
          country: it.country || "India",
          countryCode: it.countryCode || "IN",
          flag: it.flag || "🇮🇳",
          flagUrl: it.flagUrl || "https://flagcdn.com/w80/in.png",
          label: it.label || "INDIA TODAY",
          events: Number(it.events) || 0,
          eventsLabel: it.eventsLabel || `${Number(it.events) || 0} Events`,
          gold: Number(it.gold) || 0,
          silver: Number(it.silver) || 0,
          bronze: Number(it.bronze) || 0,
          total: Number(it.total) || (Number(it.gold) || 0) + (Number(it.silver) || 0) + (Number(it.bronze) || 0),
          worldRank: it.worldRank ?? 3,
          rankLabel: it.rankLabel || "India Rank",
          competition: it.competition || "Asian Games",
          active: it.active !== false,
          env: currentEnv,
          tableName: table,
          updatedAt: it.updatedAt || Date.now(),
          updatedAtIST: it.updatedAtIST || formatISTTimestamp(it.updatedAt || Date.now()),
          updatedBy: it.updatedBy || "Admin",
        };
        cachedMedalTally = data;
        return data;
      }
    } catch (dynErr: any) {
      console.warn(`[MedalTally] DynamoDB read notice on "${table}":`, dynErr?.message || dynErr);
    }
  }

  // 2. Fetch from Firestore fallback (e.g. medal_tally_dev, medal_tally_release, medal_tally)
  const firestoreCol = getFirestoreCollection("medal_tally");
  try {
    if (db) {
      const doc = await db.collection(firestoreCol).doc("current").get();
      if (doc.exists) {
        const it = doc.data() as any;
        const data: MedalTallyData = {
          id: it.id || "current",
          country: it.country || "India",
          countryCode: it.countryCode || "IN",
          flag: it.flag || "🇮🇳",
          flagUrl: it.flagUrl || "https://flagcdn.com/w80/in.png",
          label: it.label || "INDIA TODAY",
          events: Number(it.events) || 0,
          eventsLabel: it.eventsLabel || `${Number(it.events) || 0} Events`,
          gold: Number(it.gold) || 0,
          silver: Number(it.silver) || 0,
          bronze: Number(it.bronze) || 0,
          total: Number(it.total) || (Number(it.gold) || 0) + (Number(it.silver) || 0) + (Number(it.bronze) || 0),
          worldRank: it.worldRank ?? 3,
          rankLabel: it.rankLabel || "India Rank",
          competition: it.competition || "Asian Games",
          active: it.active !== false,
          env: currentEnv,
          tableName: currentTable,
          updatedAt: it.updatedAt || Date.now(),
          updatedAtIST: it.updatedAtIST || formatISTTimestamp(it.updatedAt || Date.now()),
          updatedBy: it.updatedBy || "Admin",
        };
        cachedMedalTally = data;
        return data;
      }
    }
  } catch (fsErr: any) {
    console.warn(`[MedalTally] Firestore read notice on "${firestoreCol}":`, fsErr?.message || fsErr);
  }

  return cachedMedalTally || DEFAULT_MEDAL_TALLY;
}

/**
 * Save medal tally data for the current environment
 * (Writes to TABLES.SportsData and Firestore collection via dualWrite)
 */
export async function saveMedalTally(
  input: Partial<MedalTallyData>,
  adminEmail: string = "Admin"
): Promise<{ success: boolean; data: MedalTallyData; tableName: string; env: string }> {
  const currentEnv = getEnv();
  const currentTable = TABLES.SportsData;
  const now = Date.now();
  const istTime = formatISTTimestamp(now);

  const gold = Math.max(0, Number(input.gold) || 0);
  const silver = Math.max(0, Number(input.silver) || 0);
  const bronze = Math.max(0, Number(input.bronze) || 0);
  const total = gold + silver + bronze;
  const events = Math.max(0, Number(input.events) || 0);
  const id = input.id || "current";

  const record: MedalTallyData = {
    id,
    country: (input.country || "India").trim(),
    countryCode: (input.countryCode || "IN").trim().toUpperCase(),
    flag: input.flag || "🇮🇳",
    flagUrl: input.flagUrl || "https://flagcdn.com/w80/in.png",
    label: (input.label || "INDIA TODAY").trim().toUpperCase(),
    events,
    eventsLabel: input.eventsLabel || `${events} Events`,
    gold,
    silver,
    bronze,
    total,
    worldRank: input.worldRank !== undefined && input.worldRank !== null && input.worldRank !== "" ? input.worldRank : 3,
    rankLabel: input.rankLabel || "India Rank",
    competition: input.competition || "Asian Games",
    active: input.active !== false,
    env: currentEnv,
    tableName: currentTable,
    updatedAt: now,
    updatedAtIST: istTime,
    updatedBy: adminEmail,
  };

  const dynamoItem = {
    entityId: "MEDAL_TALLY#CURRENT",
    sk: "MEDAL_TALLY#META",
    type: "medal_tally",
    ...record,
  };

  // Dual Write to DynamoDB (TABLES.SportsData: SportsData-dev, SportsData-release, or SportsData) + Firestore
  await dualWrite("medal_tally", id, currentTable, dynamoItem);

  cachedMedalTally = record;

  console.log(`[MedalTally] ✅ Updated medal tally in "${currentTable}" (${currentEnv}) for ${record.country}`);

  return {
    success: true,
    data: record,
    tableName: currentTable,
    env: currentEnv,
  };
}
