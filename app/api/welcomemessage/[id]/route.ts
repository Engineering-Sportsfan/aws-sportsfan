import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getTableName } from "@/lib/tableNames";

export const dynamic = "force-dynamic";

const TABLE_NAME = getTableName("homeDatabase") || "homeDatabase";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing ID" }, { status: 400 });
    }

    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id },
      })
    );

    if (!res.Item) {
      return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: res.Item });
  } catch (error: any) {
    console.error("[GET /api/welcomemessage/:id] Error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch item" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existingRes = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id },
      })
    );

    const existing = existingRes.Item || {};
    const updated = {
      ...existing,
      ...body,
      id,
      updatedAt: Date.now(),
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: updated,
      })
    );

    return NextResponse.json({ success: true, message: "Item updated", item: updated });
  } catch (error: any) {
    console.error("[PUT /api/welcomemessage/:id] Error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
      })
    );
    return NextResponse.json({ success: true, message: `Item ${id} deleted successfully` });
  } catch (error: any) {
    console.error("[DELETE /api/welcomemessage/:id] Error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to delete item" }, { status: 500 });
  }
}
