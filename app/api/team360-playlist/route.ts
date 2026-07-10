import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // Extract fields from FormData
    const team360PostId = formData.get("team360PostId") as string;
    
    // Handle multiple audio files
    const audioFiles = formData.getAll("audioFiles") as File[];
    const audioTitles = formData.getAll("audioTitles") as string[];
    const audioDescriptions = formData.getAll("audioDescriptions") as string[];
    const audioListens = formData.getAll("audioListens") as string[];
    const audioSignals = formData.getAll("audioSignals") as string[];
    const audioEngagement = formData.getAll("audioEngagement") as string[];
    
    // Handle multiple video files
    const videoFiles = formData.getAll("videoFiles") as File[];
    const videoTitles = formData.getAll("videoTitles") as string[];
    const videoDescriptions = formData.getAll("videoDescriptions") as string[];
    const videoListens = formData.getAll("videoListens") as string[];
    const videoSignals = formData.getAll("videoSignals") as string[];
    const videoEngagement = formData.getAll("videoEngagement") as string[];
    
    // Thumbnails for each item (optional)
    const audioThumbnails = formData.getAll("audioThumbnails") as File[];
    const videoThumbnails = formData.getAll("videoThumbnails") as File[];

    if (!team360PostId) {
      return NextResponse.json(
        { success: false, message: "team360PostId is required" },
        { status: 400 }
      );
    }

    const audioDrops = [];
    const videoDrops = [];

    // Process audio files
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const title = audioTitles[i] || `Audio ${i + 1}`;
      const description = audioDescriptions[i] || "";
      const listens = Number(audioListens[i]) || 0;
      const signals = Number(audioSignals[i]) || 0;
      const engagement = Number(audioEngagement[i]) || 0;
      
      // Upload audio to Cloudinary
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
      
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: `team360/playlists/${team360PostId}/audio`,
        resource_type: 'video', // Cloudinary uses 'video' for audio too
        public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
      });
      
      // Upload thumbnail if provided
      let thumbnailUrl = "";
      if (audioThumbnails[i]) {
        const thumbBytes = await audioThumbnails[i].arrayBuffer();
        const thumbBuffer = Buffer.from(thumbBytes);
        const thumbBase64 = `data:${audioThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;
        
        const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
          folder: `team360/playlists/${team360PostId}/audio/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${audioThumbnails[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = thumbUpload.secure_url;
      }
      
      // Format duration
      const duration = uploadRes.duration || 0;
      const formatDuration = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
      };
      
      audioDrops.push({
        title,
        duration: formatDuration(duration),
        description,
        mediaUrl: uploadRes.secure_url,
        thumbnail: thumbnailUrl,
        listens,
        signals,
        engagement,
      });
    }
    
    // Process video files
    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      const title = videoTitles[i] || `Video ${i + 1}`;
      const description = videoDescriptions[i] || "";
      const listens = Number(videoListens[i]) || 0;
      const signals = Number(videoSignals[i]) || 0;
      const engagement = Number(videoEngagement[i]) || 0;
      
      // Upload video to Cloudinary
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
      
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: `team360/playlists/${team360PostId}/video`,
        resource_type: 'video',
        public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
      });
      
      // Upload thumbnail if provided
      let thumbnailUrl = "";
      if (videoThumbnails[i]) {
        const thumbBytes = await videoThumbnails[i].arrayBuffer();
        const thumbBuffer = Buffer.from(thumbBytes);
        const thumbBase64 = `data:${videoThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;
        
        const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
          folder: `team360/playlists/${team360PostId}/video/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${videoThumbnails[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = thumbUpload.secure_url;
      }
      
      // Format duration
      const duration = uploadRes.duration || 0;
      const formatDuration = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
      };
      
      videoDrops.push({
        title,
        duration: formatDuration(duration),
        description,
        mediaUrl: uploadRes.secure_url,
        thumbnail: thumbnailUrl,
        listens,
        signals,
        engagement,
      });
    }
    
    // Create the playlist document
    const playlistData = {
      team360PostId,
      audioDrops,
      videoDrops,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const docRef = await db.collection("team360Playlists").add(playlistData);
    
    return NextResponse.json({
      success: true,
      playlist: {
        id: docRef.id,
        ...playlistData,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}





// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const team360PostId = searchParams.get("team360PostId");
//     const limit = parseInt(searchParams.get("limit") || "50");
//     const page = parseInt(searchParams.get("page") || "1");

//     // Start with collection reference
//     const collectionRef = db.collection("team360Playlists");
//     let query: FirebaseFirestore.Query = collectionRef;

//     // Apply filter if team360PostId is provided
//     if (team360PostId) {
//       query = query.where("team360PostId", "==", team360PostId);
//     }

//     // Get total count using count() on the query
//     const countSnapshot = await query.count().get();
//     const totalItems = countSnapshot.data().count;

//     // Apply pagination and ordering
//     const startAt = (page - 1) * limit;
//     const snapshot = await query
//       .orderBy("createdAt", "desc")
//       .limit(limit)
//       .offset(startAt)
//       .get();

//     const playlists = snapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));

//     return NextResponse.json({
//       success: true,
//       playlists,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(totalItems / limit),
//         totalItems,
//         itemsPerPage: limit,
//       },
//     });
//   } catch (error) {
//     console.error("Error fetching playlists:", error);
//     return NextResponse.json(
//       { success: false, message: "Failed to fetch playlists" },
//       { status: 500 }
//     );
//   }
// }



export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const team360PostId = searchParams.get("team360PostId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    // Start with collection reference
    const collectionRef = db.collection("team360Playlists");
    let query: FirebaseFirestore.Query = collectionRef;

    // Apply filter if team360PostId is provided
    if (team360PostId) {
      query = query.where("team360PostId", "==", team360PostId);
    }

    query = query.orderBy("createdAt", "desc").limit(limit);

    // Use cursor-based pagination instead of offset
    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("team360Playlists").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();

    const playlists = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get last document for next page cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      playlists,
      pagination: {
        limit,
        hasMore: playlists.length === limit,
        nextCursor: playlists.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.data()?.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching playlists:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch playlists" },
      { status: 500 }
    );
  }
}