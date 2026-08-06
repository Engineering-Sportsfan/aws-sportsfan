import { NextResponse } from "next/server";
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { dynamoDB } from "@/lib/dynamodb";

export async function GET() {
  try {
    const result = await dynamoDB.send(new ListTablesCommand({}));

    return NextResponse.json({
      success: true,
      tables: result.TableNames,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}