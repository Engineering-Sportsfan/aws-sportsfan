// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";

// // type RouteContext = { params: Promise<{ id: string }> };
// interface RouteContext {
//     params: Promise<{ matchId: string }> | { id: string };
// }

// /* ─────────────────────────────────────────────
//    Firestore structure:
//    watchAlongMatches/{id}/predictions/{predictionId}
//    {
//      question:   string
//      options:    string[]
//      votes:      Record<string, number>   // { "Yes": 5432, "No": 3210 }
//      totalVotes: number
//      closesAt:   number | null            // epoch ms
//      isOpen:     boolean
//      createdAt:  number
//      updatedAt:  number
//    }

//    watchAlongMatches/{id}/predictions/{predictionId}/userVotes/{userId}
//    { option: string, votedAt: number }
//    ───────────────────────────────────────────── */

// /* ─────────────────────────────────────────────
//    GET  /api/watch-along/matches/[id]/predictions
//    Query: ?open=true  →  only open predictions
//    ───────────────────────────────────────────── */
// // export async function GET(req: NextRequest, { params }: RouteContext) {
// //   try {
// //     const { id } = await params;
// //     const { searchParams } = new URL(req.url);
// //     const openOnly = searchParams.get("open") === "true";

// //     const matchRef = db.collection("watchAlongMatches").doc(id);
// //     const matchDoc = await matchRef.get();
// //     if (!matchDoc.exists) {
// //       return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
// //     }

// //     let query: FirebaseFirestore.Query = matchRef
// //       .collection("predictions")
// //       .orderBy("createdAt", "desc");

// //     if (openOnly) query = query.where("isOpen", "==", true);

// //     const snapshot = await query.get();
// //     const predictions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

// //     return NextResponse.json({ success: true, predictions });
// //   } catch (error) {
// //     console.error("[predictions GET]", error);
// //     return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
// //   }
// // }


// export async function GET(req: NextRequest, { params }: RouteContext) {
//     try {
//         // Handle params whether it's a Promise or object
//         const matchId = params instanceof Promise ? (await params).matchId : params.id;
        
//         const { searchParams } = new URL(req.url);
//         const openOnly = searchParams.get("open") === "true";

//         // First, check if the match exists
//         const matchRef = db.collection("watchAlongMatches").doc(matchId);
//         const matchDoc = await matchRef.get();
        
//         if (!matchDoc.exists) {
//             return NextResponse.json(
//                 { success: false, message: "Match not found" }, 
//                 { status: 404 }
//             );
//         }

//         // Build the query
//         let query: FirebaseFirestore.Query = matchRef
//             .collection("predictions")
//             .orderBy("createdAt", "desc");

//         if (openOnly) {
//             query = query.where("isOpen", "==", true);
//         }

//         const snapshot = await query.get();
        
//         const predictions = snapshot.docs.map((doc) => ({
//             id: doc.id,
//             ...doc.data()
//         }));

//         return NextResponse.json({ 
//             success: true, 
//             predictions 
//         });
        
//     } catch (error) {
//         console.error("[predictions GET] Error details:", error);
        
//         // Provide more specific error messages
//         let errorMessage = "Failed to fetch predictions";
//         if (error instanceof Error) {
//             errorMessage = error.message;
//             console.error("Error stack:", error.stack);
//         }
        
//         return NextResponse.json(
//             { 
//                 success: false, 
//                 message: errorMessage,
//                 // Optional: include error type for debugging (remove in production)
//                 errorType: error instanceof Error ? error.name : "Unknown"
//             }, 
//             { status: 500 }
//         );
//     }
// }


// /* ─────────────────────────────────────────────
//    POST  /api/watch-along/matches/[id]/predictions
//    action = "create"  (admin)
//      Body: { action, question, options: string[], closesAt?: number }

//    action = "vote"  (user)
//      Body: { action, predictionId, option, userId }
//    ───────────────────────────────────────────── */
// export async function POST(req: NextRequest, { params }: RouteContext) {
//   try {
//     const { id } = await params;
//     const body = await req.json();
//     const { action } = body;

//     const matchRef = db.collection("watchAlongMatches").doc(id);
//     const matchDoc = await matchRef.get();
//     if (!matchDoc.exists) {
//       return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
//     }

//     // ── CREATE ──
//     if (action === "create") {
//       const { question, options, closesAt } = body;

//       if (!question?.trim() || !Array.isArray(options) || options.length < 2) {
//         return NextResponse.json(
//           { success: false, message: "question and at least 2 options are required" },
//           { status: 400 }
//         );
//       }

//       const votes: Record<string, number> = {};
//       options.forEach((opt: string) => { votes[opt] = 0; });

//       const predictionData = {
//         question: question.trim(),
//         options,
//         votes,
//         totalVotes: 0,
//         closesAt: closesAt || null,
//         isOpen: true,
//         createdAt: Date.now(),
//         updatedAt: Date.now(),
//       };

//       const docRef = await matchRef.collection("predictions").add(predictionData);
//       return NextResponse.json({ success: true, prediction: { id: docRef.id, ...predictionData } });
//     }

//     // ── VOTE ──
//     if (action === "vote") {
//       const { predictionId, option, userId } = body;

//       if (!predictionId || !option || !userId) {
//         return NextResponse.json(
//           { success: false, message: "predictionId, option, and userId are required" },
//           { status: 400 }
//         );
//       }

//       const predRef = matchRef.collection("predictions").doc(predictionId);
//       const predDoc = await predRef.get();

//       if (!predDoc.exists) {
//         return NextResponse.json({ success: false, message: "Prediction not found" }, { status: 404 });
//       }

//       const pred = predDoc.data()!;

//       if (!pred.isOpen) {
//         return NextResponse.json({ success: false, message: "Prediction is closed" }, { status: 400 });
//       }
//       if (pred.closesAt && Date.now() > pred.closesAt) {
//         return NextResponse.json({ success: false, message: "Prediction has expired" }, { status: 400 });
//       }
//       if (!pred.options.includes(option)) {
//         return NextResponse.json({ success: false, message: "Invalid option" }, { status: 400 });
//       }

//       // Prevent duplicate votes
//       const userVoteRef = predRef.collection("userVotes").doc(userId);
//       const userVoteDoc = await userVoteRef.get();
//       if (userVoteDoc.exists) {
//         return NextResponse.json({ success: false, message: "Already voted" }, { status: 409 });
//       }

//       await predRef.update({
//         [`votes.${option}`]: FieldValue.increment(1),
//         totalVotes: FieldValue.increment(1),
//         updatedAt: Date.now(),
//       });

//       await userVoteRef.set({ option, votedAt: Date.now() });

//       const updated = await predRef.get();
//       return NextResponse.json({ success: true, prediction: { id: predRef.id, ...updated.data() } });
//     }

//     return NextResponse.json(
//       { success: false, message: "Invalid action. Use 'create' or 'vote'" },
//       { status: 400 }
//     );
//   } catch (error) {
//     console.error("[predictions POST]", error);
//     return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
//   }
// }

// /* ─────────────────────────────────────────────
//    PATCH  /api/watch-along/matches/[id]/predictions
//    Admin: open or close a prediction
//    Body: { predictionId: string, isOpen: boolean }
//    ───────────────────────────────────────────── */
// export async function PATCH(req: NextRequest, { params }: RouteContext) {
//   try {
//     const { id } = await params;
//     const { predictionId, isOpen } = await req.json();

//     if (!predictionId || typeof isOpen !== "boolean") {
//       return NextResponse.json(
//         { success: false, message: "predictionId and isOpen (boolean) are required" },
//         { status: 400 }
//       );
//     }

//     const matchRef = db.collection("watchAlongMatches").doc(id);
//     const predRef = matchRef.collection("predictions").doc(predictionId);
//     const predDoc = await predRef.get();

//     if (!predDoc.exists) {
//       return NextResponse.json({ success: false, message: "Prediction not found" }, { status: 404 });
//     }

//     await predRef.update({ isOpen, updatedAt: Date.now() });

//     return NextResponse.json({
//       success: true,
//       message: `Prediction ${isOpen ? "opened" : "closed"}`,
//     });
//   } catch (error) {
//     console.error("[predictions PATCH]", error);
//     return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
//   }
// }







import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";

// Use 'id' to match your folder name [id]
interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
    try {
        const { id } = await params;  // Just use 'id' directly
        
        const { searchParams } = new URL(req.url);
        const openOnly = searchParams.get("open") === "true";

        // Check if the match exists
        const matchRef = db.collection("watchAlongMatches").doc(id);

        // Build the query
        let query: FirebaseFirestore.Query = matchRef
            .collection("predictions")
            .orderBy("createdAt", "desc");

        if (openOnly) {
            query = query.where("isOpen", "==", true);
        }

        const snapshot = await query.get();
        
        const predictions = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }));

        return NextResponse.json({ 
            success: true, 
            predictions 
        });
        
    } catch (error) {
        console.error("[predictions GET] Error:", error);
        
        return NextResponse.json(
            { 
                success: false, 
                message: error instanceof Error ? error.message : "Failed to fetch predictions"
            }, 
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
    try {
        const { id } = await params;  // Just use 'id' directly
        const body = await req.json();
        const { action } = body;

        const matchRef = db.collection("watchAlongMatches").doc(id);

        // ── CREATE ──
        if (action === "create") {
            const user = await getUserSessionAndRole(req);
            if (!user) {
                return NextResponse.json(
                    { success: false, message: "Unauthorized - Authentication required" },
                    { status: 401 }
                );
            }

            const isAuth = await isAuthorizedForMatch(user, id);
            if (!isAuth) {
                return NextResponse.json(
                    { success: false, message: "Forbidden - Insufficient permissions" },
                    { status: 403 }
                );
            }

            const { question, options, closesAt } = body;

            if (!question?.trim() || !Array.isArray(options) || options.length < 2) {
                return NextResponse.json(
                    { success: false, message: "question and at least 2 options are required" },
                    { status: 400 }
                );
            }

            const votes: Record<string, number> = {};
            options.forEach((opt: string) => { votes[opt] = 0; });

            const predictionData = {
                question: question.trim(),
                options,
                votes,
                totalVotes: 0,
                closesAt: closesAt || null,
                isOpen: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const docRef = await matchRef.collection("predictions").add(predictionData);
            return NextResponse.json({ success: true, prediction: { id: docRef.id, ...predictionData } });
        }

        // ── VOTE ──
        if (action === "vote") {
            const { predictionId, option, userId } = body;

            if (!predictionId || !option || !userId) {
                return NextResponse.json(
                    { success: false, message: "predictionId, option, and userId are required" },
                    { status: 400 }
                );
            }

            const predRef = matchRef.collection("predictions").doc(predictionId);
            const predDoc = await predRef.get();

            if (!predDoc.exists) {
                return NextResponse.json({ success: false, message: "Prediction not found" }, { status: 404 });
            }

            const pred = predDoc.data()!;

            if (!pred.isOpen) {
                return NextResponse.json({ success: false, message: "Prediction is closed" }, { status: 400 });
            }
            if (pred.closesAt && Date.now() > pred.closesAt) {
                return NextResponse.json({ success: false, message: "Prediction has expired" }, { status: 400 });
            }
            if (!pred.options.includes(option)) {
                return NextResponse.json({ success: false, message: "Invalid option" }, { status: 400 });
            }

            // Prevent duplicate votes
            const userVoteRef = predRef.collection("userVotes").doc(userId);
            const userVoteDoc = await userVoteRef.get();
            if (userVoteDoc.exists) {
                return NextResponse.json({ success: false, message: "Already voted" }, { status: 409 });
            }

            await predRef.update({
                [`votes.${option}`]: FieldValue.increment(1),
                totalVotes: FieldValue.increment(1),
                updatedAt: Date.now(),
            });

            await userVoteRef.set({ option, votedAt: Date.now() });

            return NextResponse.json({ success: true, prediction: { id: predRef.id, ...pred, votes: { ...pred.votes, [option]: (pred.votes[option] || 0) + 1 }, totalVotes: pred.totalVotes + 1 } });
        }

        return NextResponse.json(
            { success: false, message: "Invalid action. Use 'create' or 'vote'" },
            { status: 400 }
        );
    } catch (error) {
        console.error("[predictions POST]", error);
        return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
    try {
        const { id } = await params;  // Just use 'id' directly

        const user = await getUserSessionAndRole(req);
        if (!user) {
            return NextResponse.json(
                { success: false, message: "Unauthorized - Authentication required" },
                { status: 401 }
            );
        }

        const isAuth = await isAuthorizedForMatch(user, id);
        if (!isAuth) {
            return NextResponse.json(
                { success: false, message: "Forbidden - Insufficient permissions" },
                { status: 403 }
            );
        }

        const { predictionId, isOpen } = await req.json();

        if (!predictionId || typeof isOpen !== "boolean") {
            return NextResponse.json(
                { success: false, message: "predictionId and isOpen (boolean) are required" },
                { status: 400 }
            );
        }

        const matchRef = db.collection("watchAlongMatches").doc(id);
        const predRef = matchRef.collection("predictions").doc(predictionId);
        const predDoc = await predRef.get();

        if (!predDoc.exists) {
            return NextResponse.json({ success: false, message: "Prediction not found" }, { status: 404 });
        }

        await predRef.update({ isOpen, updatedAt: Date.now() });

        return NextResponse.json({
            success: true,
            message: `Prediction ${isOpen ? "opened" : "closed"}`,
        });
    } catch (error) {
        console.error("[predictions PATCH]", error);
        return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
    }
}