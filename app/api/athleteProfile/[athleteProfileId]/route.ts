import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";

export async function GET(
  request: Request,
  { params }: { params: { athleteProfileId: string } }
) {
  try {
    const athleteId = params.athleteProfileId;

    const command = new GetCommand({
      TableName: "SportsData",
      Key: {
        entityId: `ATHLETE#${athleteId}`,
        sk: "PROFILE#META",
      },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      return NextResponse.json(
        { message: "Athlete not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(response.Item);
  } catch (error) {
    console.error("Error fetching athlete:", error);

    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}