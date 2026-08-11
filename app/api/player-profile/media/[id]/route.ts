// app/api/player-profile/media/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    return pathParts[pathParts.length - 1] || null;
}

// ─── GET: Single Media Doc 
export async function GET(req: NextRequest) {
    try {
        const id = getIdFromUrl(req);
        if (!id) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }

        let media: any = null;

        // 1. Try DynamoDB
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: "SportsData",
              FilterExpression: "begins_with(entityId, :mPrefix) AND (entityId = :fullId OR id = :pureId)",
              ExpressionAttributeValues: {
                ":mPrefix": "PLAYER_MEDIA#",
                ":fullId": `PLAYER_MEDIA#${id}`,
                ":pureId": id,
              },
              Limit: 1,
            })
          );

          if (scanRes.Items && scanRes.Items.length > 0) {
            media = {
              id: scanRes.Items[0].id || (scanRes.Items[0].entityId as string).replace(/^PLAYER_MEDIA#/, ""),
              ...scanRes.Items[0],
            };
          }
        } catch (e) {
          console.warn("[player-profile media [id] GET] DynamoDB notice:", e);
        }

        // 2. Fallback to Firestore
        if (!media && db) {
          const doc = await db.collection("playerMedia").doc(id).get();
          if (doc.exists) {
            media = { id: doc.id, ...doc.data() };
          }
        }

        if (!media) {
            return NextResponse.json(
                { success: false, message: "Media not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, media });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: "Fetch failed: " + (error as Error).message },
            { status: 500 }
        );
    }
}

type MediaItem = {
    title: string;
    views: string;
    time: string;
    thumbnail: string;
};

// ─── PUT: Update Media Doc 
export async function PUT(req: NextRequest) {
    try {
        const id = getIdFromUrl(req);
        if (!id) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }
        const formData = await req.formData();

        let existing: any = null;
        let existingSk = `MEDIA#${Date.now()}`;

        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: "SportsData",
              FilterExpression: "begins_with(entityId, :mPrefix) AND (entityId = :fullId OR id = :pureId)",
              ExpressionAttributeValues: {
                ":mPrefix": "PLAYER_MEDIA#",
                ":fullId": `PLAYER_MEDIA#${id}`,
                ":pureId": id,
              },
              Limit: 1,
            })
          );
          if (scanRes.Items && scanRes.Items.length > 0) {
            existing = scanRes.Items[0];
            existingSk = existing.sk || existingSk;
          }
        } catch {}

        if (!existing && db) {
          const doc = await db.collection("playerMedia").doc(id).get();
          if (doc.exists) existing = doc.data();
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: "Media not found" },
                { status: 404 }
            );
        }

        const existingData = existing as Record<string, unknown>;

        const titles = formData.getAll("titles") as string[];
        const viewsCounts = formData.getAll("views") as string[];
        const times = formData.getAll("times") as string[];
        const thumbnailFiles = formData.getAll("thumbnails") as File[];
        const existingThumbnails = formData.getAll("existingThumbnails") as string[];

        const mediaItems: MediaItem[] = [];

        for (let i = 0; i < titles.length; i++) {
            const title = titles[i] || `Media ${i + 1}`;
            const views = viewsCounts[i] || "0";
            const time = times[i] || "";

            let thumbnailUrl = existingThumbnails[i] || "";

            if (thumbnailFiles[i] && thumbnailFiles[i].size > 0) {
                const bytes = await thumbnailFiles[i].arrayBuffer();
                const buffer = Buffer.from(bytes);
                const base64 = `data:${thumbnailFiles[i].type};base64,${buffer.toString("base64")}`;
                const uploadRes = await cloudinary.uploader.upload(base64, {
                    folder: `player-profiles/${existingData.playerProfileId}/media/thumbnails`,
                    public_id: `${Date.now()}-thumbnail-${thumbnailFiles[i].name.replace(/\s/g, "_")}`,
                });
                thumbnailUrl = uploadRes.secure_url;
            }

            mediaItems.push({ title, views, time, thumbnail: thumbnailUrl });
        }

        const updateData = {
            mediaItems,
            updatedAt: Date.now(),
        };

        const updatedDoc = {
            ...existing,
            ...updateData,
            id,
        };

        // Dual-write
        await dualWrite({
            tableName: "SportsData",
            dynamoItem: {
                entityId: `PLAYER_MEDIA#${id}`,
                sk: existingSk,
                ...updatedDoc,
            },
            firestoreRef: db.collection("playerMedia").doc(id),
            firestoreData: updateData,
        });

        return NextResponse.json({
            success: true,
            media: updatedDoc,
        });
    } catch (error) {
        console.error("Update media error:", error);
        return NextResponse.json(
            { success: false, message: "Update failed: " + (error as Error).message },
            { status: 500 }
        );
    }
}

// ─── DELETE: Delete Media Doc 
export async function DELETE(req: NextRequest) {
    try {
        const id = getIdFromUrl(req);
        if (!id) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }

        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: "SportsData",
              FilterExpression: "begins_with(entityId, :mPrefix) AND (entityId = :fullId OR id = :pureId)",
              ExpressionAttributeValues: {
                ":mPrefix": "PLAYER_MEDIA#",
                ":fullId": `PLAYER_MEDIA#${id}`,
                ":pureId": id,
              },
            })
          );
          if (scanRes.Items) {
            for (const item of scanRes.Items) {
              await docClient.send(
                new DeleteCommand({
                  TableName: "SportsData",
                  Key: {
                    entityId: item.entityId,
                    sk: item.sk,
                  },
                })
              );
            }
          }
        } catch (e) {
          console.warn("[player-profile media [id] DELETE] DynamoDB notice:", e);
        }

        if (db) {
          const docRef = db.collection("playerMedia").doc(id);
          const doc = await docRef.get();
          if (doc.exists) {
            await docRef.delete();
          }
        }

        return NextResponse.json({
            success: true,
            message: "Media deleted successfully",
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: "Delete failed: " + (error as Error).message },
            { status: 500 }
        );
    }
}