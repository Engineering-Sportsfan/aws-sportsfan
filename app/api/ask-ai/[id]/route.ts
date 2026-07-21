// // app/api/ask-ai/[id]/route.ts
// import { NextRequest, NextResponse } from 'next/server'
// import { db } from "@/lib/firebaseAdmin";

// // Helper: extract ID from URL
// function getIdFromUrl(req: NextRequest): string {
//   const url = new URL(req.url);
//   const parts = url.pathname.split("/");
//   return parts[parts.length - 1];
// }

// // GET: Get a specific session by ID
// export async function GET(req: NextRequest) {
//   try {
//     const userId = req.headers.get('X-User-Id');
//     const sessionId = getIdFromUrl(req);
    
//     if (!userId) {
//       return NextResponse.json({ error: 'Unauthorized - User ID missing' }, { status: 401 });
//     }
    
//     if (!sessionId) {
//       return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
//     }
    
//     // Verify this session belongs to this user
//     const sessionRef = db
//       .collection('askaiConversations')
//       .doc(userId)
//       .collection('sessions')
//       .doc(sessionId);
    
//     const sessionDoc = await sessionRef.get();
    
//     if (!sessionDoc.exists) {
//       return NextResponse.json({ error: 'Session not found' }, { status: 404 });
//     }
    
//     // Get messages for this session
//     const messagesSnap = await sessionRef
//       .collection('messages')
//       .orderBy('timestamp', 'asc')
//       .get();
    
//     const messages = messagesSnap.docs.map(doc => ({
//       id: doc.id,
//       role: doc.data().role,
//       content: doc.data().content,
//     }));
    
//     return NextResponse.json({
//       session: { id: sessionDoc.id, ...sessionDoc.data() },
//       messages
//     });
    
//   } catch (error) {
//     console.error('[ask-ai GET session] Error:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }

// // DELETE: Delete a specific session
// export async function DELETE(req: NextRequest) {
//   try {
//     const userId = req.headers.get('X-User-Id');
//     const sessionId = getIdFromUrl(req);
    
//     if (!userId) {
//       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//     }
    
//     if (!sessionId) {
//       return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
//     }
    
//     const sessionRef = db
//       .collection('askaiConversations')
//       .doc(userId)
//       .collection('sessions')
//       .doc(sessionId);
    
//     // Verify session exists before deleting
//     const sessionDoc = await sessionRef.get();
//     if (!sessionDoc.exists) {
//       return NextResponse.json({ error: 'Session not found' }, { status: 404 });
//     }
    
//     // Delete all messages in the session first
//     const messagesSnap = await sessionRef.collection('messages').get();
//     const batch = db.batch();
//     messagesSnap.docs.forEach(doc => {
//       batch.delete(doc.ref);
//     });
//     batch.delete(sessionRef);
//     await batch.commit();
    
//     return NextResponse.json({ success: true, message: 'Session deleted' });
    
//   } catch (error) {
//     console.error('[ask-ai DELETE session] Error:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }



// app/api/ask-ai/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";

async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string; username: string } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;

  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;

  const data = snap.data() as { username?: string };
  return { id: info.actualUserId, username: data?.username ?? "Fan" };
}

function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET: Get a specific session by ID
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const sessionId = getIdFromUrl(req);
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const sessionRef = db
      .collection('askaiConversations')
      .doc(resolved.id)
      .collection('sessions')
      .doc(sessionId);

    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

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

// PATCH: Rename a specific session (sets a custom title that overrides
// the auto-derived "first question" title used in the sessions list).
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const sessionId = getIdFromUrl(req);
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const title = (body.title as string | undefined)?.trim();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (title.length > 60) {
      return NextResponse.json({ error: 'Title must be 60 characters or fewer' }, { status: 400 });
    }

    const sessionRef = db
      .collection('askaiConversations')
      .doc(resolved.id)
      .collection('sessions')
      .doc(sessionId);

    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await sessionRef.set({ customTitle: title }, { merge: true });

    return NextResponse.json({ success: true, sessionId, title });

  } catch (error) {
    console.error('[ask-ai PATCH session] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Delete a specific session
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const sessionId = getIdFromUrl(req);
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const sessionRef = db
      .collection('askaiConversations')
      .doc(resolved.id)
      .collection('sessions')
      .doc(sessionId);

    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

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