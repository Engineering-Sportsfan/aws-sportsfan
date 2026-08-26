// // app/api/ms_players/route.ts
// //
// // GET  /api/ms_players            -> list/filter players (MS_Players PROFILE#META items)
// // POST /api/ms_players            -> create a player (MS_Players + optional MS_Transactions stats row)
// //
// // Mirrors app/api/ms_teams/route.ts exactly in shape/conventions.

// import { NextRequest, NextResponse } from "next/server";
// import {
//   DynamoDBClient,
// } from "@aws-sdk/client-dynamodb";
// import {
//   DynamoDBDocumentClient,
//   ScanCommand,
//   PutCommand,
// } from "@aws-sdk/lib-dynamodb";

// const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
// const ddb = DynamoDBDocumentClient.from(client);

// const MS_PLAYERS_TABLE = process.env.MS_PLAYERS_TABLE || "MS_Players";
// const MS_TRANSACTIONS_TABLE = process.env.MS_TRANSACTIONS_TABLE || "MS_Transactions";

// // ---------- GET: list/filter ----------

// export async function GET(request: NextRequest) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const sportId = searchParams.get("sportId");
//     const clubId = searchParams.get("clubId");
//     const role = searchParams.get("role");
//     const country = searchParams.get("country");
//     const nameContains = searchParams.get("name");

//     // MS_Players is scanned (no composite key that fits every filter combo
//     // cleanly yet) and filtered to PROFILE#META items only, same pattern
//     // ms_teams/route.ts uses for MS_Clubs.
//     const filterClauses: string[] = ["sk = :sk"];
//     const expressionValues: Record<string, unknown> = { ":sk": "PROFILE#META" };
//     const expressionNames: Record<string, string> = {};

//     if (sportId) {
//       filterClauses.push("sportId = :sportId");
//       expressionValues[":sportId"] = sportId;
//     }
//     if (clubId) {
//       filterClauses.push("currentClubId = :clubId");
//       expressionValues[":clubId"] = clubId;
//     }
//     if (role) {
//       filterClauses.push("#role = :role");
//       expressionValues[":role"] = role;
//       expressionNames["#role"] = "role";
//     }
//     if (country) {
//       filterClauses.push("country = :country");
//       expressionValues[":country"] = country;
//     }
//     if (nameContains) {
//       filterClauses.push("contains(#name, :nameContains)");
//       expressionValues[":nameContains"] = nameContains;
//       expressionNames["#name"] = "name";
//     }

//     const result = await ddb.send(
//       new ScanCommand({
//         TableName: MS_PLAYERS_TABLE,
//         FilterExpression: filterClauses.join(" AND "),
//         ExpressionAttributeValues: expressionValues,
//         ...(Object.keys(expressionNames).length > 0 && {
//           ExpressionAttributeNames: expressionNames,
//         }),
//       })
//     );

//     return NextResponse.json({
//       players: result.Items || [],
//       count: result.Count || 0,
//     });
//   } catch (error) {
//     console.error("GET /api/ms_players failed:", error);
//     return NextResponse.json(
//       { error: "Failed to list players" },
//       { status: 500 }
//     );
//   }
// }

// // ---------- POST: create ----------

// export async function POST(request: NextRequest) {
//   try {
//     const body = await request.json();

//     if (!body.playerId || !body.name) {
//       return NextResponse.json(
//         { error: "playerId and name are required" },
//         { status: 400 }
//       );
//     }

//     const now = new Date().toISOString();

//     const playerItem = {
//       entityId: `PLAYER#${body.playerId}`,
//       sk: "PROFILE#META",
//       playerId: body.playerId,
//       name: body.name,
//       role: body.role ?? null,
//       battingStyle: body.battingStyle ?? null,
//       bowlingStyle: body.bowlingStyle ?? null,
//       isCaptain: Boolean(body.isCaptain),
//       currentClubId: body.currentClubId ?? null,
//       sportId: body.sportId ?? "cricket",
//       format: body.format ?? "Test",
//       testCaps: body.testCaps ?? null,
//       dateOfBirth: body.dateOfBirth ?? null,
//       birthPlace: body.birthPlace ?? null,
//       heightCm: body.heightCm ?? null,
//       profileImage: body.profileImage ?? null,
//       country: body.country ?? null,
//       flag: body.flag ?? null,
//       createdAt: now,
//       updatedAt: now,
//     };

//     await ddb.send(
//       new PutCommand({ TableName: MS_PLAYERS_TABLE, Item: playerItem })
//     );

//     // Optional accompanying stats row, same AFFIL#... sk pattern used for
//     // teams' combined record_highlight+analytics item.
//     if (body.levelFormatId && (body.battingStats || body.bowlingStats)) {
//       const txnItem = {
//         entityId: `PLAYER#${body.playerId}`,
//         sk: `AFFIL#${playerItem.sportId}#${body.levelFormatId}#${playerItem.format}#STATS`,
//         playerId: body.playerId,
//         clubId: body.currentClubId ?? null,
//         sportId: playerItem.sportId,
//         levelFormatId: body.levelFormatId,
//         format: playerItem.format,
//         battingStats: body.battingStats ?? null,
//         bowlingStats: body.bowlingStats ?? null,
//         recordHighlight: body.recordHighlight ?? null,
//         createdAt: now,
//         updatedAt: now,
//       };

//       await ddb.send(
//         new PutCommand({ TableName: MS_TRANSACTIONS_TABLE, Item: txnItem })
//       );
//     }

//     return NextResponse.json({ player: playerItem }, { status: 201 });
//   } catch (error) {
//     console.error("POST /api/ms_players failed:", error);
//     return NextResponse.json(
//       { error: "Failed to create player" },
//       { status: 500 }
//     );
//   }
// }




// app/api/ms_players/route.ts
//
// GET  /api/ms_players            -> list/filter players (MS_Players PROFILE#META items)
// POST /api/ms_players            -> create a player (MS_Players + optional MS_Transactions stats row)
//
// Mirrors app/api/ms_teams/route.ts exactly in shape/conventions.

import { NextRequest, NextResponse } from "next/server";
import { docClient as ddb } from "@/lib/dynamodb";
import { ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const MS_PLAYERS_TABLE = process.env.MS_PLAYERS_TABLE || "MS_Players";
const MS_TRANSACTIONS_TABLE = process.env.MS_TRANSACTIONS_TABLE || "MS_Transactions";

// ---------- GET: list/filter ----------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sportId = searchParams.get("sportId");
    const clubId = searchParams.get("clubId");
    const role = searchParams.get("role");
    const country = searchParams.get("country");
    const nameContains = searchParams.get("name");

    // MS_Players is scanned (no composite key that fits every filter combo
    // cleanly yet) and filtered to PROFILE#META items only, same pattern
    // ms_teams/route.ts uses for MS_Clubs.
    const filterClauses: string[] = ["sk = :sk"];
    const expressionValues: Record<string, unknown> = { ":sk": "PROFILE#META" };
    const expressionNames: Record<string, string> = {};

    if (sportId) {
      filterClauses.push("sportId = :sportId");
      expressionValues[":sportId"] = sportId;
    }
    if (clubId) {
      filterClauses.push("currentClubId = :clubId");
      expressionValues[":clubId"] = clubId;
    }
    if (role) {
      filterClauses.push("#role = :role");
      expressionValues[":role"] = role;
      expressionNames["#role"] = "role";
    }
    if (country) {
      filterClauses.push("country = :country");
      expressionValues[":country"] = country;
    }
    if (nameContains) {
      filterClauses.push("contains(#name, :nameContains)");
      expressionValues[":nameContains"] = nameContains;
      expressionNames["#name"] = "name";
    }

    const result = await ddb.send(
      new ScanCommand({
        TableName: MS_PLAYERS_TABLE,
        FilterExpression: filterClauses.join(" AND "),
        ExpressionAttributeValues: expressionValues,
        ...(Object.keys(expressionNames).length > 0 && {
          ExpressionAttributeNames: expressionNames,
        }),
      })
    );

    return NextResponse.json({
      players: result.Items || [],
      count: result.Count || 0,
    });
  } catch (error) {
    console.error("GET /api/ms_players failed:", error);
    return NextResponse.json(
      { error: "Failed to list players" },
      { status: 500 }
    );
  }
}

// ---------- POST: create ----------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.playerId || !body.name) {
      return NextResponse.json(
        { error: "playerId and name are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const playerItem = {
      entityId: `PLAYER#${body.playerId}`,
      sk: "PROFILE#META",
      playerId: body.playerId,
      name: body.name,
      role: body.role ?? null,
      battingStyle: body.battingStyle ?? null,
      bowlingStyle: body.bowlingStyle ?? null,
      isCaptain: Boolean(body.isCaptain),
      currentClubId: body.currentClubId ?? null,
      sportId: body.sportId ?? "cricket",
      format: body.format ?? "Test",
      gender: body.gender ?? "male",
      testCaps: body.testCaps ?? null,
      dateOfBirth: body.dateOfBirth ?? null,
      birthPlace: body.birthPlace ?? null,
      heightCm: body.heightCm ?? null,
      profileImage: body.profileImage ?? null,
      country: body.country ?? null,
      flag: body.flag ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await ddb.send(
      new PutCommand({ TableName: MS_PLAYERS_TABLE, Item: playerItem })
    );

    // Optional accompanying stats row, same AFFIL#... sk pattern used for
    // teams' combined record_highlight+analytics item.
    if (body.levelFormatId && (body.battingStats || body.bowlingStats)) {
      const txnItem = {
        entityId: `PLAYER#${body.playerId}`,
        sk: `AFFIL#${playerItem.sportId}#${body.levelFormatId}#${playerItem.format}#STATS`,
        playerId: body.playerId,
        clubId: body.currentClubId ?? null,
        sportId: playerItem.sportId,
        levelFormatId: body.levelFormatId,
        format: playerItem.format,
        battingStats: body.battingStats ?? null,
        bowlingStats: body.bowlingStats ?? null,
        recordHighlight: body.recordHighlight ?? null,
        createdAt: now,
        updatedAt: now,
      };

      await ddb.send(
        new PutCommand({ TableName: MS_TRANSACTIONS_TABLE, Item: txnItem })
      );
    }

    return NextResponse.json({ player: playerItem }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ms_players failed:", error);
    return NextResponse.json(
      { error: "Failed to create player" },
      { status: 500 }
    );
  }
}