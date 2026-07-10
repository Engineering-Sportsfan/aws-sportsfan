import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import cloudinary from "@/lib/cloudinary";


// Define types
interface DropItem {
  title: string;
  duration: string;
  description: string;
  mediaUrl: string;
  thumbnail: string;
  listens: number;
  signals: number;
  engagement: number;
}

interface PlaylistData {
  matchesPlaylistId: string;
  audioDrops: DropItem[];
  videoDrops: DropItem[];
  createdAt?: number;
  updatedAt?: number;
}

// Helper function to extract ID from URL
function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

// Format duration helper
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// GET single playlist by ID
export async function GET(req: NextRequest) {
  try {
    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }


    // Get the playlist document from Firestore
    const docRef = db.collection("matchesPlaylistId").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Playlist not found" },
        { status: 404 }
      );
    }

    // Return the playlist data
    return NextResponse.json({
      success: true,
      playlist: {
        id: doc.id,
        ...doc.data(),
      },
    });
  } catch (error) {
    console.error("Error fetching playlist:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch playlist" },
      { status: 500 }
    );
  }
}




export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    // Check if playlist exists
    const docRef = db.collection("matchPlaylists").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Playlist not found" },
        { status: 404 }
      );
    }

    const existingData = doc.data() as PlaylistData | undefined;
    
    // Check if request is FormData (file upload) or JSON (simple update)
    const contentType = req.headers.get("content-type") || "";
    const isFormData = contentType.includes("multipart/form-data");

    let audioDrops: DropItem[] = existingData?.audioDrops || [];
    let videoDrops: DropItem[] = existingData?.videoDrops || [];
    let matchesPlaylistId: string = existingData?.matchesPlaylistId || "";

    if (isFormData) {
      // Handle FormData with file uploads
      const formData = await req.formData();
      
      // Update matchesPlaylistId if provided
      const newMatchesPlaylistId = formData.get("matchesPlaylistId") as string;
      if (newMatchesPlaylistId) {
        matchesPlaylistId = newMatchesPlaylistId;
      }
      
      // Handle existing drops (passed as JSON strings)
      const existingAudioDropsStr = formData.get("existingAudioDrops") as string;
      const existingVideoDropsStr = formData.get("existingVideoDrops") as string;
      
      // Parse existing drops if provided
      if (existingAudioDropsStr) {
        audioDrops = JSON.parse(existingAudioDropsStr) as DropItem[];
      }
      if (existingVideoDropsStr) {
        videoDrops = JSON.parse(existingVideoDropsStr) as DropItem[];
      }
      
      // Handle deletion of specific drops
      const deleteAudioIndices = formData.getAll("deleteAudioIndices") as string[];
      const deleteVideoIndices = formData.getAll("deleteVideoIndices") as string[];
      
      if (deleteAudioIndices.length > 0) {
        audioDrops = audioDrops.filter((_: DropItem, index: number) => 
          !deleteAudioIndices.includes(index.toString())
        );
      }
      if (deleteVideoIndices.length > 0) {
        videoDrops = videoDrops.filter((_: DropItem, index: number) => 
          !deleteVideoIndices.includes(index.toString())
        );
      }
      
      // Handle new audio files
      const audioFiles = formData.getAll("audioFiles") as File[];
      const audioTitles = formData.getAll("audioTitles") as string[];
      const audioDescriptions = formData.getAll("audioDescriptions") as string[];
      const audioListens = formData.getAll("audioListens") as string[];
      const audioSignals = formData.getAll("audioSignals") as string[];
      const audioEngagement = formData.getAll("audioEngagement") as string[];
      const audioThumbnails = formData.getAll("audioThumbnails") as File[];
      
      // Process new audio files
      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        if (!file || file.size === 0) continue;
        
        const title = audioTitles[i] || `Audio ${audioDrops.length + 1}`;
        const description = audioDescriptions[i] || "";
        const listens = Number(audioListens[i]) || 0;
        const signals = Number(audioSignals[i]) || 0;
        const engagement = Number(audioEngagement[i]) || 0;
        
        // Upload audio to Cloudinary
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
        
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `matches/playlists/${matchesPlaylistId}/audio`,
          resource_type: 'video',
          public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
        });
        
        // Upload thumbnail if provided
        let thumbnailUrl = "";
        if (audioThumbnails[i]) {
          const thumbBytes = await audioThumbnails[i].arrayBuffer();
          const thumbBuffer = Buffer.from(thumbBytes);
          const thumbBase64 = `data:${audioThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;
          
          const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
            folder: `matches/playlists/${matchesPlaylistId}/audio/thumbnails`,
            public_id: `${Date.now()}-thumbnail-${audioThumbnails[i].name.replace(/\s/g, "_")}`,
          });
          thumbnailUrl = thumbUpload.secure_url;
        }
        
        // Format duration
        const duration = uploadRes.duration || 0;
        
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
      
      // Handle new video files
      const videoFiles = formData.getAll("videoFiles") as File[];
      const videoTitles = formData.getAll("videoTitles") as string[];
      const videoDescriptions = formData.getAll("videoDescriptions") as string[];
      const videoListens = formData.getAll("videoListens") as string[];
      const videoSignals = formData.getAll("videoSignals") as string[];
      const videoEngagement = formData.getAll("videoEngagement") as string[];
      const videoThumbnails = formData.getAll("videoThumbnails") as File[];
      
      // Process new video files
      for (let i = 0; i < videoFiles.length; i++) {
        const file = videoFiles[i];
        if (!file || file.size === 0) continue;
        
        const title = videoTitles[i] || `Video ${videoDrops.length + 1}`;
        const description = videoDescriptions[i] || "";
        const listens = Number(videoListens[i]) || 0;
        const signals = Number(videoSignals[i]) || 0;
        const engagement = Number(videoEngagement[i]) || 0;
        
        // Upload video to Cloudinary
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
        
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `matches/playlists/${matchesPlaylistId}/video`,
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
            folder: `matches/playlists/${matchesPlaylistId}/video/thumbnails`,
            public_id: `${Date.now()}-thumbnail-${videoThumbnails[i].name.replace(/\s/g, "_")}`,
          });
          thumbnailUrl = thumbUpload.secure_url;
        }
        
        // Format duration
        const duration = uploadRes.duration || 0;
        
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
      
      // Update the playlist - use object spread to fix Firestore type issue
      const updatedData = {
        matchesPlaylistId,
        audioDrops,
        videoDrops,
        updatedAt: Date.now(),
      };
      
      await docRef.update(updatedData);
      
      const updatedDoc = await docRef.get();
      
      return NextResponse.json({
        success: true,
        playlist: {
          id: updatedDoc.id,
          ...updatedDoc.data(),
        },
      });
      
    } else {
      // Handle JSON update (partial or full update without files)
      const body = await req.json();
      
      // Only update fields that are provided
      const updateData: Record<string, unknown> = {
        updatedAt: Date.now(),
      };
      
      if (body.matchesPlaylistId !== undefined) {
        updateData.matchesPlaylistId = body.matchesPlaylistId;
      }
      if (body.audioDrops !== undefined) {
        updateData.audioDrops = body.audioDrops;
      }
      if (body.videoDrops !== undefined) {
        updateData.videoDrops = body.videoDrops;
      }
      
      await docRef.update(updateData);
      
      const updatedDoc = await docRef.get();
      
      return NextResponse.json({
        success: true,
        playlist: {
          id: updatedDoc.id,
          ...updatedDoc.data(),
        },
      });
    }
    
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  try {
    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }


    await db.collection("matchPlaylists").doc(id).delete();

    return NextResponse.json({
      success: true,
      message: "Playlist deleted",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Delete failed" },
      { status: 500 }
    );
  }
}