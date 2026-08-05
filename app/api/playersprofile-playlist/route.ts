// app/api/playersprofile-playlist/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    const playerProfilesId = formData.get("playerProfilesId") as string;
    
    const audioFiles = formData.getAll("audioFiles") as File[];
    const audioTitles = formData.getAll("audioTitles") as string[];
    const audioDescriptions = formData.getAll("audioDescriptions") as string[];
    const audioListens = formData.getAll("audioListens") as string[];
    const audioSignals = formData.getAll("audioSignals") as string[];
    const audioEngagement = formData.getAll("audioEngagement") as string[];
    
    const videoFiles = formData.getAll("videoFiles") as File[];
    const videoTitles = formData.getAll("videoTitles") as string[];
    const videoDescriptions = formData.getAll("videoDescriptions") as string[];
    const videoListens = formData.getAll("videoListens") as string[];
    const videoSignals = formData.getAll("videoSignals") as string[];
    const videoEngagement = formData.getAll("videoEngagement") as string[];
    
    const audioThumbnails = formData.getAll("audioThumbnails") as File[];
    const videoThumbnails = formData.getAll("videoThumbnails") as File[];

    if (!playerProfilesId) {
      return NextResponse.json(
        { success: false, message: "playerProfilesId is required" },
        { status: 400 }
      );
    }

    const audioDrops = [];
    const videoDrops = [];

    const formatDuration = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const title = audioTitles[i] || `Audio ${i + 1}`;
      const description = audioDescriptions[i] || "";
      const listens = Number(audioListens[i]) || 0;
      const signals = Number(audioSignals[i]) || 0;
      const engagement = Number(audioEngagement[i]) || 0;
      
      let uploadUrl = "";
      let duration = 0;
      if (file && file.size > 0) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
        
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `playersprofile/playlists/${playerProfilesId}/audio`,
          resource_type: 'video',
          public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
        });
        uploadUrl = uploadRes.secure_url;
        duration = uploadRes.duration || 0;
      }
      
      let thumbnailUrl = "";
      if (audioThumbnails[i] && audioThumbnails[i].size > 0) {
        const thumbBytes = await audioThumbnails[i].arrayBuffer();
        const thumbBuffer = Buffer.from(thumbBytes);
        const thumbBase64 = `data:${audioThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;
        
        const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
          folder: `playerProfiles/playlists/${playerProfilesId}/audio/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${audioThumbnails[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = thumbUpload.secure_url;
      }
      
      audioDrops.push({
        title,
        duration: formatDuration(duration),
        description,
        mediaUrl: uploadUrl,
        thumbnail: thumbnailUrl,
        listens,
        signals,
        engagement,
      });
    }

    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      const title = videoTitles[i] || `Video ${i + 1}`;
      const description = videoDescriptions[i] || "";
      const listens = Number(videoListens[i]) || 0;
      const signals = Number(videoSignals[i]) || 0;
      const engagement = Number(videoEngagement[i]) || 0;
      
      let uploadUrl = "";
      let duration = 0;
      if (file && file.size > 0) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
        
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `playersprofile/playlists/${playerProfilesId}/video`,
          resource_type: 'video',
          public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
        });
        uploadUrl = uploadRes.secure_url;
        duration = uploadRes.duration || 0;
      }
      
      let thumbnailUrl = "";
      if (videoThumbnails[i] && videoThumbnails[i].size > 0) {
        const thumbBytes = await videoThumbnails[i].arrayBuffer();
        const thumbBuffer = Buffer.from(thumbBytes);
        const thumbBase64 = `data:${videoThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;
        
        const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
          folder: `playerProfiles/playlists/${playerProfilesId}/video/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${videoThumbnails[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = thumbUpload.secure_url;
      }
      
      videoDrops.push({
        title,
        duration: formatDuration(duration),
        description,
        mediaUrl: uploadUrl,
        thumbnail: thumbnailUrl,
        listens,
        signals,
        engagement,
      });
    }

    const now = Date.now();
    const id = `pplaylist_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const playlistData = {
      id,
      playerProfilesId,
      audioDrops,
      videoDrops,
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write
    await dualWrite({
      tableName: "SocialAndContent",
      dynamoItem: {
        contentId: `PLAYER_PLAYLIST#${id}`,
        sk: "PLAYLIST#META",
        ...playlistData,
      },
      firestoreRef: db.collection("playerProfilePlaylists").doc(id),
      firestoreData: playlistData,
    });

    return NextResponse.json({
      success: true,
      playlist: playlistData,
    });
  } catch (error) {
    console.error("Create playlist error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerProfilesId = searchParams.get("playerProfilesId");
    const limit = parseInt(searchParams.get("limit") || "20");

    let playlists: any[] = [];

    // 1. Try DynamoDB
    try {
      let filterExpr = "begins_with(contentId, :pPrefix)";
      const exprVals: Record<string, any> = {
        ":pPrefix": "PLAYER_PLAYLIST#",
      };

      if (playerProfilesId) {
        filterExpr += " AND playerProfilesId = :ppId";
        exprVals[":ppId"] = playerProfilesId;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          Limit: 50,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        playlists = scanRes.Items.map((item) => ({
          id: item.id || (item.contentId as string).replace(/^PLAYER_PLAYLIST#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[playersprofile-playlist GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (playlists.length === 0 && db) {
      let query: FirebaseFirestore.Query = db.collection("playerProfilePlaylists");
      if (playerProfilesId) {
        query = query.where("playerProfilesId", "==", playerProfilesId);
      }
      query = query.orderBy("createdAt", "desc").limit(limit);
      const snapshot = await query.get();

      playlists = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    playlists.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paged = playlists.slice(0, limit);

    return NextResponse.json({
      success: true,
      playlists: paged,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Fetch failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}