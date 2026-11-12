import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand, PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getTableName } from "@/lib/tableNames";
import { getMedalTally } from "@/lib/medalTallyService";

export const dynamic = "force-dynamic";

const TABLE_NAME = getTableName("homeDatabase") || "homeDatabase";

function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return -1;
  const clean = timeStr.trim().toUpperCase();
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!ampmMatch) {
    const looseMatch = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);
    if (looseMatch) {
      let hours = parseInt(looseMatch[1], 10);
      const minutes = looseMatch[2] ? parseInt(looseMatch[2], 10) : 0;
      const period = looseMatch[3];
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    return -1;
  }
  let hours = parseInt(ampmMatch[1], 10);
  const minutes = parseInt(ampmMatch[2], 10);
  const period = ampmMatch[3];
  if (period === "PM" && hours < 12) hours += 12;
  else if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function getIndiaDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseEventDateTimeToTimestamp(
  dateStr?: string,
  timeStr?: string,
  now: Date = new Date()
): number {
  const nowISTString = getIndiaDateString(now);
  let cleanDate = (dateStr || "").trim();
  if (!cleanDate) cleanDate = nowISTString;

  if (cleanDate.includes("T")) {
    const parsedIso = new Date(cleanDate).getTime();
    if (!isNaN(parsedIso) && parsedIso > 0) return parsedIso;
  }

  let year = 0;
  let month = 0;
  let day = 0;

  const ymdMatch = cleanDate.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    year = parseInt(ymdMatch[1], 10);
    month = parseInt(ymdMatch[2], 10);
    day = parseInt(ymdMatch[3], 10);
  } else {
    const dmyMatch = cleanDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      day = parseInt(dmyMatch[1], 10);
      month = parseInt(dmyMatch[2], 10);
      year = parseInt(dmyMatch[3], 10);
    } else {
      const todayParts = nowISTString.split("-");
      year = parseInt(todayParts[0], 10);
      month = parseInt(todayParts[1], 10);
      day = parseInt(todayParts[2], 10);
    }
  }

  const timeMinutes = parseTimeToMinutes(timeStr);
  let hours = 0;
  let minutes = 0;
  if (timeMinutes >= 0) {
    hours = Math.floor(timeMinutes / 60);
    minutes = timeMinutes % 60;
  }

  const utcOffsetMs = (5 * 60 + 30) * 60 * 1000;
  return Date.UTC(year, month - 1, day, hours, minutes, 0, 0) - utcOffsetMs;
}

function isEventOver24hFinished(item: any, now: Date = new Date()): boolean {
  const nowMs = now.getTime();
  const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  const rawStatus = (item.statusType || "").toLowerCase().trim();
  const rawLabel = (item.statusLabel || "").toUpperCase().trim();
  const isAutoMode = rawStatus === "auto" || item.statusMode === "auto" || rawLabel === "AUTO";
  const isExplicitCompleted = rawStatus === "completed" || rawStatus === "finished" || rawLabel === "COMPLETED" || rawLabel === "FINISHED";
  const isExplicitLive = rawStatus === "live" || rawLabel === "LIVE";
  const isExplicitUpNext = rawStatus === "up_next" || rawLabel === "UP NEXT";
  const isManual = item.isManual === true || item.statusMode === "manual" || (!isAutoMode && (isExplicitCompleted || isExplicitLive || isExplicitUpNext));

  const startDateStr = item.startDate || item.date;
  const startTimeStr = item.startTime || item.time;
  const startTimestamp = parseEventDateTimeToTimestamp(startDateStr, startTimeStr, now);

  let endTimestamp: number;
  const hasCustomEnd = Boolean(item.endDate || item.endTime);
  if (hasCustomEnd) {
    const effectiveEndDate = item.endDate || startDateStr;
    const effectiveEndTime = item.endTime || startTimeStr;
    let parsedEnd = parseEventDateTimeToTimestamp(effectiveEndDate, effectiveEndTime, now);
    if (parsedEnd <= startTimestamp && effectiveEndDate === startDateStr) {
      parsedEnd += 24 * 60 * 60 * 1000;
    }
    endTimestamp = parsedEnd;
  } else {
    endTimestamp = startTimestamp + MATCH_DURATION_MS;
  }

  // Explicit completed (manual)
  if (isExplicitCompleted && isManual) {
    const finishedTimestamp = endTimestamp <= nowMs ? endTimestamp : nowMs;
    return nowMs - finishedTimestamp > TWENTY_FOUR_HOURS_MS;
  }

  // Explicit manual live / up_next / scheduled are NOT finished
  if (isManual && (isExplicitLive || isExplicitUpNext || rawStatus === "scheduled")) {
    return false;
  }

  // Auto time-based
  const isFinished = nowMs >= endTimestamp;
  if (!isFinished) return false;

  return nowMs - endTimestamp > TWENTY_FOUR_HOURS_MS;
}

/**
 * GET /api/welcomemessage
 * Query params:
 *  - type: 'all' | 'morning_brief' | 'todays_agenda' | 'radar_card' | 'welcome_config'
 *  - includeInactive: 'true' | 'false' (default: false for client, true for admin)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filterType = searchParams.get("type");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
      })
    );

    const items = scanResult.Items || [];

    // Filter active items for public feed unless includeInactive is requested
    const filteredItems = includeInactive
      ? items
      : items.filter((item) => item.active !== false);

    const now = new Date();

    // Segregate data categories
    const morningBrief = filteredItems
      .filter((item) => item.type === "morning_brief")
      .sort((a, b) => (Number(a.order ?? a.storyNumber ?? 0) - Number(b.order ?? b.storyNumber ?? 0)));

    // On frontend feeds (!includeInactive), exclude events that finished > 24 hours ago
    const todaysAgenda = filteredItems
      .filter((item) => item.type === "todays_agenda")
      .filter((item) => includeInactive || !isEventOver24hFinished(item, now))
      .sort((a, b) => (Number(a.order ?? 0) - Number(b.order ?? 0)));

    const radarCards = filteredItems
      .filter((item) => item.type === "radar_card")
      .sort((a, b) => (Number(a.order ?? 0) - Number(b.order ?? 0)));

    const config =
      items.find((item) => item.type === "welcome_config" || item.id === "config_welcome") || {
        id: "config_welcome",
        type: "welcome_config",
        actionSubtitle: "Top action today · Asian Games",
        agendaDateTitle: "Tuesday · 23 September",
        briefTitle: "Daily Huddle",
        briefSubtitle: "Top 5 stories to know today",
      };

    const medalTally = await getMedalTally();

    const headers = {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    };

    // If a specific type was requested
    if (filterType === "morning_brief") {
      return NextResponse.json({ success: true, items: morningBrief }, { headers });
    }
    if (filterType === "todays_agenda") {
      return NextResponse.json({ success: true, items: todaysAgenda }, { headers });
    }
    if (filterType === "radar_card") {
      return NextResponse.json({ success: true, items: radarCards }, { headers });
    }
    if (filterType === "medal_tally") {
      return NextResponse.json({ success: true, item: medalTally }, { headers });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          config,
          morningBrief,
          todaysAgenda,
          radarCards,
          medalTally,
        },
        counts: {
          morningBrief: morningBrief.length,
          todaysAgenda: todaysAgenda.length,
          radarCards: radarCards.length,
          total: items.length,
        },
      },
      { headers }
    );
  } catch (error: any) {
    console.error("[GET /api/welcomemessage] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch welcome message data",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/welcomemessage
 * Creates a new item in homeDatabase
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.type) {
      return NextResponse.json(
        { success: false, error: "Field 'type' is required (e.g. 'morning_brief', 'todays_agenda', 'radar_card')" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const idPrefix =
      body.type === "morning_brief"
        ? "brief_"
        : body.type === "todays_agenda"
        ? "agenda_"
        : body.type === "radar_card"
        ? "radar_"
        : "item_";

    const id = body.id || `${idPrefix}${now}_${Math.random().toString(36).substring(2, 6)}`;

    const itemToSave = {
      ...body,
      id,
      active: body.active !== undefined ? Boolean(body.active) : true,
      order: body.order !== undefined ? Number(body.order) : 99,
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: itemToSave,
      })
    );

    return NextResponse.json({
      success: true,
      message: "Item created successfully in homeDatabase",
      item: itemToSave,
    });
  } catch (error: any) {
    console.error("[POST /api/welcomemessage] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to create item in homeDatabase",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/welcomemessage
 * Updates an item in homeDatabase
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // Support batch reorder
    if (body.action === "reorder" && Array.isArray(body.items)) {
      const now = Date.now();
      const updatePromises = body.items.map(async (item: { id: string; order?: number; storyNumber?: number }) => {
        if (!item.id) return;
        const existingRes = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: item.id },
          })
        );
        const existing = existingRes.Item || {};
        const updated = {
          ...existing,
          ...item,
          ...(item.order !== undefined ? { order: Number(item.order) } : {}),
          ...(item.storyNumber !== undefined ? { storyNumber: Number(item.storyNumber) } : {}),
          updatedAt: now,
        };
        return docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: updated,
          })
        );
      });

      await Promise.all(updatePromises);

      return NextResponse.json({
        success: true,
        message: "Items reordered successfully in homeDatabase",
      });
    }

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "Field 'id' is required for update" },
        { status: 400 }
      );
    }

    // Check if item exists
    const existingRes = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: body.id },
      })
    );

    const existing = existingRes.Item || {};
    const now = Date.now();

    const updatedItem: Record<string, any> = {
      ...existing,
      ...body,
      updatedAt: now,
    };

    // Explicitly delete optional CTA/link fields if they were cleared/removed in the form
    const ctaFields = [
      "predictId",
      "predictTitle",
      "predictUrl",
      "discussPostId",
      "discussTitle",
      "discussUrl",
      "debateRoomId",
      "debateTitle",
      "debateUrl",
      "endDate",
      "endTime",
    ];

    for (const field of ctaFields) {
      if (field in body) {
        if (!body[field] || body[field] === "" || body[field] === null) {
          delete updatedItem[field];
        }
      }
    }

    if (body.order !== undefined) {
      updatedItem.order = Number(body.order);
    }
    if (body.storyNumber !== undefined) {
      updatedItem.storyNumber = Number(body.storyNumber);
    }
    if (body.active !== undefined) {
      updatedItem.active = Boolean(body.active);
    }

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: updatedItem,
      })
    );

    return NextResponse.json({
      success: true,
      message: "Item updated successfully",
      item: updatedItem,
    });
  } catch (error: any) {
    console.error("[PUT /api/welcomemessage] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to update item in homeDatabase",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/welcomemessage
 * Query params: ?id=... or JSON body: { id: "..." }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch {
        // empty body
      }
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Item 'id' is required for deletion" },
        { status: 400 }
      );
    }

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
      })
    );

    return NextResponse.json({
      success: true,
      message: `Item ${id} deleted successfully from homeDatabase`,
    });
  } catch (error: any) {
    console.error("[DELETE /api/welcomemessage] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to delete item from homeDatabase",
      },
      { status: 500 }
    );
  }
}
