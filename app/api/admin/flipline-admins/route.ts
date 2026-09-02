import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toLowerCase();

    let filterExpression = "begins_with(entityId, :prefix) AND sk = :sk";
    const expressionAttributeValues: Record<string, unknown> = {
      ":prefix": "USER#",
      ":sk": "USER#META",
    };

    if (search) {
      const searchLower = search;
      const searchTitle = search.charAt(0).toUpperCase() + search.slice(1);
      const searchUpper = search.toUpperCase();

      filterExpression += " AND (contains(email, :searchLower) OR contains(firstName, :searchLower) OR contains(firstName, :searchTitle) OR contains(lastName, :searchLower) OR contains(lastName, :searchTitle) OR contains(firstName, :searchUpper) OR contains(lastName, :searchUpper))";

      expressionAttributeValues[":searchLower"] = searchLower;
      expressionAttributeValues[":searchTitle"] = searchTitle;
      expressionAttributeValues[":searchUpper"] = searchUpper;
    }

    let items: Array<Record<string, unknown>> = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined = undefined;

    do {
      const scanRes: any = await docClient.send(
        new ScanCommand({
          TableName: TABLES.IdentityAndAccess,
          FilterExpression: filterExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      if (scanRes.Items) {
        items = items.concat(scanRes.Items as Array<Record<string, unknown>>);
      }
      lastEvaluatedKey = scanRes.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    if (search) {
      // In-memory post-filter to catch any casing/special character mismatches
      const filtered = items.filter((item) => {
        const fullName = `${(item.firstName as string) ?? ""} ${(item.lastName as string) ?? ""}`.toLowerCase();
        const email = ((item.email as string) ?? "").toLowerCase();
        return fullName.includes(search) || email.includes(search);
      });
      return NextResponse.json({ users: filtered }, { headers: { "Cache-Control": "no-store" } });
    } else {
      // Filter for FlipLineAdmin role
      const admins = items.filter((item) => item.role === "FlipLineAdmin");
      return NextResponse.json({ users: admins }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error: unknown) {
    console.error("GET /api/admin/flipline-admins error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch users";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, role, title, verifiedFlipLineAdmin, addfliplineAdminPhoto } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const targetRole = role ?? "FlipLineAdmin";

    // 1. Update in DynamoDB (IdentityAndAccess)
    const updateExpressionParts = ["#role = :role", "updatedAt = :updatedAt"];
    const expressionAttributeNames: Record<string, string> = {
      "#role": "role",
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ":role": targetRole,
      ":updatedAt": Date.now(),
    };

    if (title !== undefined) {
      updateExpressionParts.push("#title = :title");
      expressionAttributeNames["#title"] = "title";
      expressionAttributeValues[":title"] = title;
    }
    if (verifiedFlipLineAdmin !== undefined) {
      updateExpressionParts.push("#verified = :verified");
      expressionAttributeNames["#verified"] = "verifiedFlipLineAdmin";
      expressionAttributeValues[":verified"] = verifiedFlipLineAdmin;
    }
    if (addfliplineAdminPhoto !== undefined) {
      updateExpressionParts.push("#photo = :photo");
      expressionAttributeNames["#photo"] = "addfliplineAdminPhoto";
      expressionAttributeValues[":photo"] = addfliplineAdminPhoto;
    }

    const updateExpression = "SET " + updateExpressionParts.join(", ");

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.IdentityAndAccess,
        Key: {
          entityId: `USER#${email}`,
          sk: "USER#META",
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    // 2. Sync to Firebase
    try {
      const fbData: Record<string, unknown> = {
        role: targetRole,
        updatedAt: Date.now(),
      };
      if (title !== undefined) fbData.title = title;
      if (verifiedFlipLineAdmin !== undefined) fbData.verifiedFlipLineAdmin = verifiedFlipLineAdmin;
      if (addfliplineAdminPhoto !== undefined) fbData.addfliplineAdminPhoto = addfliplineAdminPhoto;

      await db.collection("users").doc(email).set(fbData, { merge: true });
    } catch (fbErr) {
      console.warn("Firebase role sync warning:", fbErr);
    }

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("POST /api/admin/flipline-admins error:", error);
    const msg = error instanceof Error ? error.message : "Failed to update role";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
