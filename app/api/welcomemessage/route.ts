import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand, PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getTableName } from "@/lib/tableNames";

export const dynamic = "force-dynamic";

const TABLE_NAME = getTableName("homeDatabase") || "homeDatabase";

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

    // Segregate data categories
    const morningBrief = filteredItems
      .filter((item) => item.type === "morning_brief")
      .sort((a, b) => (Number(a.order ?? a.storyNumber ?? 0) - Number(b.order ?? b.storyNumber ?? 0)));

    const todaysAgenda = filteredItems
      .filter((item) => item.type === "todays_agenda")
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
        briefSubtitle: "Top 5 stories to know today",
      };

    // If a specific type was requested
    if (filterType === "morning_brief") {
      return NextResponse.json({ success: true, items: morningBrief });
    }
    if (filterType === "todays_agenda") {
      return NextResponse.json({ success: true, items: todaysAgenda });
    }
    if (filterType === "radar_card") {
      return NextResponse.json({ success: true, items: radarCards });
    }

    return NextResponse.json({
      success: true,
      data: {
        config,
        morningBrief,
        todaysAgenda,
        radarCards,
      },
      counts: {
        morningBrief: morningBrief.length,
        todaysAgenda: todaysAgenda.length,
        radarCards: radarCards.length,
        total: items.length,
      },
    });
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

    const updatedItem = {
      ...existing,
      ...body,
      updatedAt: now,
    };

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
