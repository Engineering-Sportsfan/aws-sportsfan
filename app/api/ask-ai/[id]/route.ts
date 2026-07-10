// app/api/ask-ai/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from "@/lib/firebaseAdmin";

// Helper: extract ID from URL
function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET: Get a specific session by ID
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('X-User-Id');
    const sessionId = getIdFromUrl(req);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized - User ID missing' }, { status: 401 });
    }
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }
    
    // Verify this session belongs to this user
    const sessionRef = db
      .collection('askaiConversations')
      .doc(userId)
      .collection('sessions')
      .doc(sessionId);
    
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    
    // Get messages for this session
    const messagesSnap = await sessionRef
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .get();
    
    const messages = messagesSnap.docs.map(doc => ({
      id: doc.id,
      role: doc.data().role,
      content: doc.data().content,
    }));
    
    return NextResponse.json({
      session: { id: sessionDoc.id, ...sessionDoc.data() },
      messages
    });
    
  } catch (error) {
    console.error('[ask-ai GET session] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Delete a specific session
export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get('X-User-Id');
    const sessionId = getIdFromUrl(req);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }
    
    const sessionRef = db
      .collection('askaiConversations')
      .doc(userId)
      .collection('sessions')
      .doc(sessionId);
    
    // Verify session exists before deleting
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    
    // Delete all messages in the session first
    const messagesSnap = await sessionRef.collection('messages').get();
    const batch = db.batch();
    messagesSnap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    batch.delete(sessionRef);
    await batch.commit();
    
    return NextResponse.json({ success: true, message: 'Session deleted' });
    
  } catch (error) {
    console.error('[ask-ai DELETE session] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}