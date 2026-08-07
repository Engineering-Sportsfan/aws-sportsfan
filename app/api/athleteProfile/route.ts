import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";

export async function GET() {
  try {
    const athletes: Record<string, any>[] = [];

    let ExclusiveStartKey: Record<string, any> | undefined;

    do {
      const command = new ScanCommand({
        TableName: "SportsData",

        FilterExpression:
          "sk = :sk AND begins_with(entityId, :entityPrefix)",

        ExpressionAttributeValues: {
          ":sk": "PROFILE#META",
          ":entityPrefix": "ATHLETE#",
        },

        ExclusiveStartKey,
      });

      const response = await docClient.send(command);

      if (response.Items) {
        athletes.push(...response.Items);
      }

      ExclusiveStartKey = response.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return NextResponse.json({
      athletes,
      count: athletes.length,
    });
  } catch (error) {
    console.error("Error fetching all athletes:", error);

    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}