import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function DELETE(
  req: Request,
  { params }: { params: { roomId: string; botId: string } }
) {
  try {
    const { roomId, botId } = params;

    if (!roomId || !botId) {
      return NextResponse.json({ success: false, error: "Missing roomId or botId" }, { status: 400 });
    }
    
    // We can't use FieldValue.delete() easily if we aren't sure if it's admin SDK or client SDK in this route.
    // So let's fetch the room, modify the botConfig, and save it back.
    const roomRef = db.collection("roarRooms").doc(roomId);
    const roomSnap = await roomRef.get();
    
    if (!roomSnap.exists) {
       return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
    }
    
    const data = roomSnap.data();
    if (data?.botConfig && data.botConfig[botId]) {
       const newConfig = { ...data.botConfig };
       delete newConfig[botId];
       await roomRef.update({ botConfig: newConfig });
    }

    return NextResponse.json({ success: true, message: `Bot ${botId} stopped in room ${roomId}` });
  } catch (error: any) {
    console.error("Error stopping room bot:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to stop room bot" },
      { status: 500 }
    );
  }
}
