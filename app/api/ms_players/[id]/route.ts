// // app/api/ms_players/[id]/route.ts
// //
// // GET    /api/ms_players/[id]   -> profile (MS_Players) + all AFFIL#...#STATS rows (MS_Transactions)
// // PUT    /api/ms_players/[id]   -> partial update of the profile item
// // DELETE /api/ms_players/[id]   -> deletes profile item + its stats rows
// //
// // IMPORTANT (known recurring bug in this pipeline): in Next.js 15, `params`
// // is a Promise and must be awaited, AND the dynamic folder segment name
// // must match the destructured key exactly. This folder is [id], so the
// // destructure below MUST be `{ id }`, never `{ teamId }`/`{ playerId }` —
// // mismatching the two caused a `.startsWith` crash twice on the teams route.

// import { NextRequest, NextResponse } from "next/server";
// import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// import {
//   DynamoDBDocumentClient,
//   GetCommand,
//   QueryCommand,
//   UpdateCommand,
//   DeleteCommand,
// } from "@aws-sdk/lib-dynamodb";
// import { assemblePlayerDocument } from "@/lib/assemblePlayerDocument";

// const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
// const ddb = DynamoDBDocumentClient.from(client);

// const MS_PLAYERS_TABLE = process.env.MS_PLAYERS_TABLE || "MS_Players";
// const MS_TRANSACTIONS_TABLE = process.env.MS_TRANSACTIONS_TABLE || "MS_Transactions";

// type RouteParams = { params: Promise<{ id: string }> };

// // ---------- GET: profile + stats ----------

// export async function GET(request: NextRequest, { params }: RouteParams) {
//   try {
//     const { id } = await params;
//     const entityId = `PLAYER#${id}`;

//     const profileResult = await ddb.send(
//       new GetCommand({
//         TableName: MS_PLAYERS_TABLE,
//         Key: { entityId, sk: "PROFILE#META" },
//       })
//     );

//     if (!profileResult.Item) {
//       return NextResponse.json({ error: "Player not found" }, { status: 404 });
//     }

//     // All AFFIL#<sportId>#<levelFormatId>#<format>#STATS rows for this
//     // player — one Query by entityId, same fetch pattern documented for
//     // the wider multi-sport schema.
//     const statsResult = await ddb.send(
//       new QueryCommand({
//         TableName: MS_TRANSACTIONS_TABLE,
//         KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :prefix)",
//         ExpressionAttributeValues: {
//           ":entityId": entityId,
//           ":prefix": "AFFIL#",
//         },
//       })
//     );

//     return NextResponse.json(
//       assemblePlayerDocument(profileResult.Item as any, (statsResult.Items || []) as any, {
//         levelFormatId: request.nextUrl.searchParams.get("levelFormatId") ?? undefined,
//       })
//     );
//   } catch (error) {
//     console.error("GET /api/ms_players/[id] failed:", error);
//     return NextResponse.json(
//       { error: "Failed to fetch player" },
//       { status: 500 }
//     );
//   }
// }

// // ---------- PUT: partial update ----------

// const UPDATABLE_FIELDS = [
//   "name",
//   "role",
//   "battingStyle",
//   "bowlingStyle",
//   "isCaptain",
//   "currentClubId",
//   "testCaps",
//   "dateOfBirth",
//   "birthPlace",
//   "heightCm",
//   "profileImage",
//   "country",
//   "flag",
// ];

// export async function PUT(request: NextRequest, { params }: RouteParams) {
//   try {
//     const { id } = await params;
//     const entityId = `PLAYER#${id}`;
//     const body = await request.json();

//     const updates = Object.entries(body).filter(([key]) =>
//       UPDATABLE_FIELDS.includes(key)
//     );

//     if (updates.length === 0) {
//       return NextResponse.json(
//         { error: "No updatable fields provided" },
//         { status: 400 }
//       );
//     }

//     const setClauses: string[] = ["#updatedAt = :updatedAt"];
//     const expressionValues: Record<string, unknown> = {
//       ":updatedAt": new Date().toISOString(),
//     };
//     const expressionNames: Record<string, string> = { "#updatedAt": "updatedAt" };

//     updates.forEach(([key, value], i) => {
//       const nameKey = `#f${i}`;
//       const valueKey = `:v${i}`;
//       setClauses.push(`${nameKey} = ${valueKey}`);
//       expressionNames[nameKey] = key;
//       expressionValues[valueKey] = value;
//     });

//     const result = await ddb.send(
//       new UpdateCommand({
//         TableName: MS_PLAYERS_TABLE,
//         Key: { entityId, sk: "PROFILE#META" },
//         UpdateExpression: `SET ${setClauses.join(", ")}`,
//         ExpressionAttributeNames: expressionNames,
//         ExpressionAttributeValues: expressionValues,
//         ConditionExpression: "attribute_exists(entityId)",
//         ReturnValues: "ALL_NEW",
//       })
//     );

//     return NextResponse.json({ player: result.Attributes });
//   } catch (error: any) {
//     if (error?.name === "ConditionalCheckFailedException") {
//       return NextResponse.json({ error: "Player not found" }, { status: 404 });
//     }
//     console.error("PUT /api/ms_players/[id] failed:", error);
//     return NextResponse.json(
//       { error: "Failed to update player" },
//       { status: 500 }
//     );
//   }
// }

// // ---------- DELETE ----------

// export async function DELETE(request: NextRequest, { params }: RouteParams) {
//   try {
//     const { id } = await params;
//     const entityId = `PLAYER#${id}`;

//     const statsResult = await ddb.send(
//       new QueryCommand({
//         TableName: MS_TRANSACTIONS_TABLE,
//         KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :prefix)",
//         ExpressionAttributeValues: {
//           ":entityId": entityId,
//           ":prefix": "AFFIL#",
//         },
//       })
//     );

//     await Promise.all(
//       (statsResult.Items || []).map((item: Record<string, unknown>) =>
//         ddb.send(
//           new DeleteCommand({
//             TableName: MS_TRANSACTIONS_TABLE,
//             Key: { entityId: item.entityId, sk: item.sk },
//           })
//         )
//       )
//     );

//     await ddb.send(
//       new DeleteCommand({
//         TableName: MS_PLAYERS_TABLE,
//         Key: { entityId, sk: "PROFILE#META" },
//       })
//     );

//     return NextResponse.json({ deleted: true, id });
//   } catch (error) {
//     console.error("DELETE /api/ms_players/[id] failed:", error);
//     return NextResponse.json(
//       { error: "Failed to delete player" },
//       { status: 500 }
//     );
//   }
// }




// app/api/ms_players/[id]/route.ts
//
// GET    /api/ms_players/[id]   -> profile (MS_Players) + all AFFIL#...#STATS rows (MS_Transactions)
// PUT    /api/ms_players/[id]   -> partial update of the profile item
// DELETE /api/ms_players/[id]   -> deletes profile item + its stats rows
//
// IMPORTANT (known recurring bug in this pipeline): in Next.js 15, `params`
// is a Promise and must be awaited, AND the dynamic folder segment name
// must match the destructured key exactly. This folder is [id], so the
// destructure below MUST be `{ id }`, never `{ teamId }`/`{ playerId }` —
// mismatching the two caused a `.startsWith` crash twice on the teams route.

import { NextRequest, NextResponse } from "next/server";
import { docClient as ddb } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { assemblePlayerDocument } from "@/lib/assemblePlayerDocument";

const MS_PLAYERS_TABLE = TABLES.MS_Players;
const MS_TRANSACTIONS_TABLE = TABLES.MS_Transactions;

type RouteParams = { params: Promise<{ id: string }> };

// ---------- GET: profile + stats ----------

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tournamentParam = request.nextUrl.searchParams.get("tournament");
    const entityCandidates = [`PLAYER#${id}`, `ATHLETE#${id}`, id];

    let profileItem: Record<string, any> | null = null;
    let resolvedEntityId = `PLAYER#${id}`;

    for (const entId of entityCandidates) {
      // 1. Try exact PROFILE#META first
      try {
        const getRes = await ddb.send(
          new GetCommand({
            TableName: MS_PLAYERS_TABLE,
            Key: { entityId: entId, sk: "PROFILE#META" },
          })
        );
        if (getRes.Item) {
          profileItem = getRes.Item;
          resolvedEntityId = entId;
          break;
        }
      } catch {}

      // 2. Query for items where sk begins_with PROFILE#META (e.g. PROFILE#META#IPL, PROFILE#META#T20I)
      try {
        const qRes = await ddb.send(
          new QueryCommand({
            TableName: MS_PLAYERS_TABLE,
            KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":entityId": entId,
              ":skPrefix": "PROFILE#META",
            },
          })
        );

        if (qRes.Items && qRes.Items.length > 0) {
          resolvedEntityId = entId;
          if (tournamentParam) {
            const matched = qRes.Items.find(
              (item: any) =>
                (item.tournament || "").toLowerCase() === tournamentParam.toLowerCase() ||
                item.sk === `PROFILE#META#${tournamentParam}`
            );
            profileItem = matched || qRes.Items[0];
          } else {
            profileItem = qRes.Items[0];
          }
          break;
        }
      } catch {}
    }

    // Enrich or fallback with SportsData table (for medalData, consistencyData, etc.)
    for (const entId of entityCandidates) {
      try {
        const sdRes = await ddb.send(
          new GetCommand({
            TableName: TABLES.SportsData,
            Key: { entityId: entId, sk: "PROFILE#META" },
          })
        );
        if (sdRes.Item) {
          if (!profileItem) {
            profileItem = sdRes.Item;
            resolvedEntityId = entId;
          } else {
            profileItem = {
              ...sdRes.Item,
              ...profileItem,
              medalData: sdRes.Item.medalData ?? profileItem.medalData,
              consistencyData: sdRes.Item.consistencyData ?? profileItem.consistencyData,
              seasonalData: sdRes.Item.seasonalData ?? profileItem.seasonalData,
              record_highlight: sdRes.Item.record_highlight ?? profileItem.record_highlight,
              analytics: {
                ...(sdRes.Item.analytics || {}),
                ...(profileItem.analytics || {}),
                medalData: sdRes.Item.medalData ?? sdRes.Item.analytics?.medalData ?? profileItem.analytics?.medalData,
                consistencyData: sdRes.Item.consistencyData ?? sdRes.Item.analytics?.consistencyData ?? profileItem.analytics?.consistencyData,
                seasonalData: sdRes.Item.seasonalData ?? sdRes.Item.analytics?.seasonalData ?? profileItem.analytics?.seasonalData,
              },
            };
          }
          break;
        }
      } catch {}

      if (!profileItem) {
        try {
          const qRes = await ddb.send(
            new QueryCommand({
              TableName: TABLES.SportsData,
              KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :skPrefix)",
              ExpressionAttributeValues: {
                ":entityId": entId,
                ":skPrefix": "PROFILE#META",
              },
            })
          );
          if (qRes.Items && qRes.Items.length > 0) {
            profileItem = qRes.Items[0];
            resolvedEntityId = entId;
            break;
          }
        } catch {}
      }
    }

    if (!profileItem) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // All AFFIL#<sportId>#<levelFormatId>#<format>#STATS rows for this player
    const statsResult = await ddb.send(
      new QueryCommand({
        TableName: MS_TRANSACTIONS_TABLE,
        KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":entityId": resolvedEntityId,
          ":prefix": "AFFIL#",
        },
      })
    );

    return NextResponse.json(
      assemblePlayerDocument(profileItem as any, (statsResult.Items || []) as any, {
        levelFormatId: request.nextUrl.searchParams.get("levelFormatId") ?? undefined,
      })
    );
  } catch (error) {
    console.error("GET /api/ms_players/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch player" },
      { status: 500 }
    );
  }
}

// ---------- PUT: partial update ----------

const UPDATABLE_FIELDS = [
  "name",
  "role",
  "battingStyle",
  "bowlingStyle",
  "isCaptain",
  "currentClubId",
  "testCaps",
  "dateOfBirth",
  "birthPlace",
  "heightCm",
  "profileImage",
  "country",
  "flag",
];

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const entityCandidates = [`PLAYER#${id}`, `ATHLETE#${id}`, id];
    let resolvedEntityId = `PLAYER#${id}`;
    let resolvedSk = body.sk || "PROFILE#META";

    if (!body.sk) {
      for (const entId of entityCandidates) {
        try {
          const qRes = await ddb.send(
            new QueryCommand({
              TableName: MS_PLAYERS_TABLE,
              KeyConditionExpression: "entityId = :e AND begins_with(sk, :sk)",
              ExpressionAttributeValues: { ":e": entId, ":sk": "PROFILE#META" },
            })
          );
          if (qRes.Items && qRes.Items.length > 0) {
            resolvedEntityId = entId;
            resolvedSk = qRes.Items[0].sk;
            break;
          }
        } catch {}
      }
    }

    const updates = Object.entries(body).filter(([key]) =>
      UPDATABLE_FIELDS.includes(key)
    );

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const setClauses: string[] = ["#updatedAt = :updatedAt"];
    const expressionValues: Record<string, unknown> = {
      ":updatedAt": new Date().toISOString(),
    };
    const expressionNames: Record<string, string> = { "#updatedAt": "updatedAt" };

    updates.forEach(([key, value], i) => {
      const nameKey = `#f${i}`;
      const valueKey = `:v${i}`;
      setClauses.push(`${nameKey} = ${valueKey}`);
      expressionNames[nameKey] = key;
      expressionValues[valueKey] = value;
    });

    const result = await ddb.send(
      new UpdateCommand({
        TableName: MS_PLAYERS_TABLE,
        Key: { entityId: resolvedEntityId, sk: resolvedSk },
        UpdateExpression: `SET ${setClauses.join(", ")}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ConditionExpression: "attribute_exists(entityId)",
        ReturnValues: "ALL_NEW",
      })
    );

    return NextResponse.json({ player: result.Attributes });
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    console.error("PUT /api/ms_players/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to update player" },
      { status: 500 }
    );
  }
}

// ---------- DELETE ----------

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const entityCandidates = [`PLAYER#${id}`, `ATHLETE#${id}`, id];

    for (const entId of entityCandidates) {
      // Delete from MS_TRANSACTIONS_TABLE
      try {
        const statsResult = await ddb.send(
          new QueryCommand({
            TableName: MS_TRANSACTIONS_TABLE,
            KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :prefix)",
            ExpressionAttributeValues: {
              ":entityId": entId,
              ":prefix": "AFFIL#",
            },
          })
        );

        if (statsResult.Items && statsResult.Items.length > 0) {
          await Promise.all(
            statsResult.Items.map((item: Record<string, unknown>) =>
              ddb.send(
                new DeleteCommand({
                  TableName: MS_TRANSACTIONS_TABLE,
                  Key: { entityId: item.entityId, sk: item.sk },
                })
              )
            )
          );
        }
      } catch {}

      // Delete from MS_PLAYERS_TABLE
      try {
        const playerItemsRes = await ddb.send(
          new QueryCommand({
            TableName: MS_PLAYERS_TABLE,
            KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":entityId": entId,
              ":skPrefix": "PROFILE#META",
            },
          })
        );

        if (playerItemsRes.Items && playerItemsRes.Items.length > 0) {
          await Promise.all(
            playerItemsRes.Items.map((item: Record<string, unknown>) =>
              ddb.send(
                new DeleteCommand({
                  TableName: MS_PLAYERS_TABLE,
                  Key: { entityId: item.entityId, sk: item.sk },
                })
              )
            )
          );
        }
      } catch {}
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("DELETE /api/ms_players/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to delete player" },
      { status: 500 }
    );
  }
}