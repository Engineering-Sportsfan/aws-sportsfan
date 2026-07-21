
// // app/api/ask-ai/route.ts
// import { NextRequest, NextResponse } from 'next/server'
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from 'firebase-admin/firestore'

// const sessionCache = new Map<string, { data: Record<string, unknown>; timestamp: number }>();
// const CACHE_DURATION = 5000;

// export async function POST(req: NextRequest) {
//   try {
//     let body: Record<string, unknown>;
//     try {
//       body = await req.json();
//     } catch {
//       return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
//     }

//     const userId = body.userId as string | undefined;
//     if (!userId) {
//       return NextResponse.json({ error: 'Unauthorized - User ID missing' }, { status: 401 });
//     }

//     const query = (body.query as string | undefined)?.trim();
//     const sessionId = (body.sessionId as string | undefined) || crypto.randomUUID();
//     const history = Array.isArray(body.history) ? body.history : [];
//     const userEmail = (body.userEmail as string) || '';
//     const userName = (body.userName as string) || '';

//     if (!query) {
//       return NextResponse.json({ error: 'Empty query' }, { status: 400 });
//     }

//     const PYTHON_AI_URL = process.env.PYTHON_AI_URL;
//     if (!PYTHON_AI_URL) {
//       console.error("[ask-ai] PYTHON_AI_URL not configured");
//       return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
//     }

//     // --- Call Python AI service ---
//     let answer = '';
//     let sources: string[] = [];
//     let metadata: Record<string, unknown> = {};

//     try {
//       const aiRes = await fetch(`${PYTHON_AI_URL}/chat`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           'x-api-key': process.env.PYTHON_AI_KEY ?? '',
//         },
//         body: JSON.stringify({
//           query,
//           conversation_history: history,
//           user_id: userId,
//           session_id: sessionId,
//         }),
//       });

//       if (!aiRes.ok) {
//         const errText = await aiRes.text().catch(() => '');
//         console.error(`[ask-ai] Python service returned ${aiRes.status}: ${errText}`);
//         throw new Error(`Python service returned ${aiRes.status}`);
//       }

//       const data = await aiRes.json();
//       answer = data.answer ?? '';
//       sources = data.sources ?? [];
//       metadata = data.metadata ?? {};

//     } catch (err) {
//       console.error('[ask-ai] Python call failed:', err);
//       return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 });
//     }

//     // --- Save to Firestore (non-blocking on failure) ---
//     try {
//       if (!db) throw new Error('Firestore db is not initialized');

//       const sessionRef = db
//         .collection('askaiConversations')
//         .doc(userId)
//         .collection('sessions')
//         .doc(sessionId);

//       const msgCol = sessionRef.collection('messages');

//       // Use a batch for atomicity and fewer round-trips
//       const batch = db.batch();

//       batch.set(sessionRef, {
//         updatedAt: FieldValue.serverTimestamp(),
//         userId,
//         userEmail,
//         userName,
//       }, { merge: true });

//       const userMsgRef = msgCol.doc();
//       batch.set(userMsgRef, {
//         role: 'user',
//         content: query,
//         timestamp: FieldValue.serverTimestamp(),
//       });

//       const assistantMsgRef = msgCol.doc();
//       batch.set(assistantMsgRef, {
//         role: 'assistant',
//         content: answer,
//         sources,
//         metadata,
//         timestamp: FieldValue.serverTimestamp(),
//       });

//       await batch.commit();

//       sessionCache.delete(userId);

//     } catch (err) {
//       // Log but don't fail the request — the AI answer is already ready
//       console.error('[ask-ai] Firestore write failed:', err);
//     }

//     return NextResponse.json({ answer, sources, sessionId });

//   } catch (error) {
//     console.error('[ask-ai] Unhandled error:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }

// export async function GET(req: NextRequest) {
//   try {
//     const userId = req.headers.get('X-User-Id');

//     if (!userId) {
//       return NextResponse.json({ error: 'Unauthorized - User ID missing' }, { status: 401 });
//     }

//     const cached = sessionCache.get(userId);
//     if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
//       return NextResponse.json(cached.data);
//     }

//     if (!db) {
//       return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
//     }

//     const sessionsSnap = await db
//       .collection('askaiConversations')
//       .doc(userId)
//       .collection('sessions')
//       .orderBy('updatedAt', 'desc')
//       .limit(1)
//       .get();

//     if (sessionsSnap.empty) {
//       return NextResponse.json({ messages: [], sessionId: null });
//     }

//     const sessionDoc = sessionsSnap.docs[0];
//     const sessionId = sessionDoc.id;

//     const messagesSnap = await db
//       .collection('askaiConversations')
//       .doc(userId)
//       .collection('sessions')
//       .doc(sessionId)
//       .collection('messages')
//       .orderBy('timestamp', 'asc')
//       .limit(50)
//       .get();

//     const messages = messagesSnap.docs.map(doc => ({
//       id: doc.id,
//       role: doc.data().role as 'user' | 'assistant',
//       content: doc.data().content as string,
//     }));

//     const responseData = { messages, sessionId };

//     sessionCache.set(userId, { data: responseData, timestamp: Date.now() });

//     // Evict stale cache entries
//     if (sessionCache.size > 100) {
//       const now = Date.now();
//       for (const [key, value] of sessionCache.entries()) {
//         if (now - value.timestamp > 30000) sessionCache.delete(key);
//       }
//     }

//     return NextResponse.json(responseData);

//   } catch (error) {
//     console.error('[ask-ai GET] Error:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }

// export async function DELETE(req: NextRequest) {
//   try {
//     const userId = req.headers.get('X-User-Id');
//     const { searchParams } = new URL(req.url);
//     const sessionId = searchParams.get('sessionId');

//     if (!userId) {
//       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//     }

//     if (sessionId) {
//       return NextResponse.json(
//         { error: 'Use /api/ask-ai/{id} to delete a specific session' },
//         { status: 400 }
//       );
//     }

//     if (!db) {
//       return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
//     }

//     const sessionsSnap = await db
//       .collection('askaiConversations')
//       .doc(userId)
//       .collection('sessions')
//       .get();

//     // Firestore batch max is 500 ops — chunk if needed
//     const OPS_PER_BATCH = 400;
//     let batch = db.batch();
//     let opCount = 0;

//     for (const sessionDoc of sessionsSnap.docs) {
//       const messagesSnap = await sessionDoc.ref.collection('messages').get();

//       for (const msgDoc of messagesSnap.docs) {
//         batch.delete(msgDoc.ref);
//         opCount++;
//         if (opCount >= OPS_PER_BATCH) {
//           await batch.commit();
//           batch = db.batch();
//           opCount = 0;
//         }
//       }

//       batch.delete(sessionDoc.ref);
//       opCount++;
//       if (opCount >= OPS_PER_BATCH) {
//         await batch.commit();
//         batch = db.batch();
//         opCount = 0;
//       }
//     }

//     if (opCount > 0) await batch.commit();

//     sessionCache.delete(userId);

//     return NextResponse.json({ success: true, message: 'All sessions deleted' });

//   } catch (error) {
//     console.error('[ask-ai DELETE] Error:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }





// app/api/ask-ai/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from 'firebase-admin/firestore'
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";

const sessionCache = new Map<string, { data: Record<string, unknown>; timestamp: number }>();
const CACHE_DURATION = 5000;

// ── Same canonical resolution pattern used across ROAR (dolly, messages,
// votes) — ensures Ask AI sessions are filed under the same
// users/{actualUserId} as everything else, not a divergent/spoofable ID.
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

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const query = (body.query as string | undefined)?.trim();
    const sessionId = (body.sessionId as string | undefined) || crypto.randomUUID();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!query) {
      return NextResponse.json({ error: 'Empty query' }, { status: 400 });
    }

    const PYTHON_AI_URL = process.env.PYTHON_AI_URL;
    if (!PYTHON_AI_URL) {
      console.error("[ask-ai] PYTHON_AI_URL not configured");
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    // --- Call Python AI service ---
    let answer = '';
    let sources: string[] = [];
    let metadata: Record<string, unknown> = {};

    try {
      const aiRes = await fetch(`${PYTHON_AI_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.PYTHON_AI_KEY ?? '',
        },
        body: JSON.stringify({
          query,
          conversation_history: history,
          user_id: resolved.id,
          session_id: sessionId,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => '');
        console.error(`[ask-ai] Python service returned ${aiRes.status}: ${errText}`);
        throw new Error(`Python service returned ${aiRes.status}`);
      }

      const data = await aiRes.json();
      answer = data.answer ?? '';
      sources = data.sources ?? [];
      metadata = data.metadata ?? {};

    } catch (err) {
      console.error('[ask-ai] Python call failed:', err);
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 });
    }

    // --- Save to Firestore (non-blocking on failure) ---
    let userMessageId: string | undefined;
    let assistantMessageId: string | undefined;
    try {
      if (!db) throw new Error('Firestore db is not initialized');

      const sessionRef = db
        .collection('askaiConversations')
        .doc(resolved.id)
        .collection('sessions')
        .doc(sessionId);

      const msgCol = sessionRef.collection('messages');

      // Use a batch for atomicity and fewer round-trips
      const batch = db.batch();

      batch.set(sessionRef, {
        updatedAt: FieldValue.serverTimestamp(),
        userId: resolved.id,
        userEmail: user.email,
        userName: resolved.username,
      }, { merge: true });

      const userMsgRef = msgCol.doc();
      userMessageId = userMsgRef.id;
      batch.set(userMsgRef, {
        role: 'user',
        content: query,
        timestamp: FieldValue.serverTimestamp(),
      });

      const assistantMsgRef = msgCol.doc();
      assistantMessageId = assistantMsgRef.id;
      batch.set(assistantMsgRef, {
        role: 'assistant',
        content: answer,
        sources,
        metadata,
        timestamp: FieldValue.serverTimestamp(),
      });

      await batch.commit();

      sessionCache.delete(resolved.id);

    } catch (err) {
      // Log but don't fail the request — the AI answer is already ready
      console.error('[ask-ai] Firestore write failed:', err);
    }

    return NextResponse.json({ answer, sources, sessionId, userMessageId, messageId: assistantMessageId });

  } catch (error) {
    console.error('[ask-ai] Unhandled error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    const cached = sessionCache.get(resolved.id);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }

    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const sessionsSnap = await db
      .collection('askaiConversations')
      .doc(resolved.id)
      .collection('sessions')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    if (sessionsSnap.empty) {
      return NextResponse.json({ messages: [], sessionId: null });
    }

    const sessionDoc = sessionsSnap.docs[0];
    const sessionId = sessionDoc.id;

    const messagesSnap = await db
      .collection('askaiConversations')
      .doc(resolved.id)
      .collection('sessions')
      .doc(sessionId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .limit(50)
      .get();

    const messages = messagesSnap.docs.map(doc => ({
      id: doc.id,
      role: doc.data().role as 'user' | 'assistant',
      content: doc.data().content as string,
    }));

    const responseData = { messages, sessionId };

    sessionCache.set(resolved.id, { data: responseData, timestamp: Date.now() });

    // Evict stale cache entries
    if (sessionCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of sessionCache.entries()) {
        if (now - value.timestamp > 30000) sessionCache.delete(key);
      }
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('[ask-ai GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (sessionId) {
      return NextResponse.json(
        { error: 'Use /api/ask-ai/{id} to delete a specific session' },
        { status: 400 }
      );
    }

    if (!db) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const sessionsSnap = await db
      .collection('askaiConversations')
      .doc(resolved.id)
      .collection('sessions')
      .get();

    // Firestore batch max is 500 ops — chunk if needed
    const OPS_PER_BATCH = 400;
    let batch = db.batch();
    let opCount = 0;

    for (const sessionDoc of sessionsSnap.docs) {
      const messagesSnap = await sessionDoc.ref.collection('messages').get();

      for (const msgDoc of messagesSnap.docs) {
        batch.delete(msgDoc.ref);
        opCount++;
        if (opCount >= OPS_PER_BATCH) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }

      batch.delete(sessionDoc.ref);
      opCount++;
      if (opCount >= OPS_PER_BATCH) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) await batch.commit();

    sessionCache.delete(resolved.id);

    return NextResponse.json({ success: true, message: 'All sessions deleted' });

  } catch (error) {
    console.error('[ask-ai DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}