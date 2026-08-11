// app/api/request-drop/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type RequestStatus = "pending" | "approved" | "rejected" | "completed";

interface RequestData {
    userName: string;
    message: string;
    audioTitle: string | null;
    userId: string | null;
    status: RequestStatus;
    createdAt: number;
    updatedAt: number;
    isRead: boolean;
    isFlagged: boolean;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userName, message, audioTitle, userId } = body;

        if (!userName || !message) {
            return NextResponse.json(
                { success: false, message: "UserName and message are required" },
                { status: 400 }
            );
        }

        const now = Date.now();
        const id = `drop_req_${now}_${Math.random().toString(36).substring(2, 9)}`;

        const requestData: RequestData = {
            userName: userName.trim(),
            message: message.trim(),
            audioTitle: audioTitle || null,
            userId: userId || null,
            status: "pending",
            createdAt: now,
            updatedAt: now,
            isRead: false,
            isFlagged: false,
        };

        await dualWrite({
            tableName: "SocialAndContent",
            dynamoItem: {
                contentId: `DROP_REQUEST#${id}`,
                sk: `REQUEST#${now}`,
                id,
                ...requestData,
            },
            firestoreRef: db.collection("dropRequests").doc(id),
            firestoreData: requestData,
        });

        return NextResponse.json({
            success: true,
            request: { id, ...requestData }
        });
    } catch (error: unknown) {
        console.error("Request drop POST error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to submit request" },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const limit = parseInt(searchParams.get("limit") || "50");

        let requests: any[] = [];

        try {
            let filterExpr = "begins_with(contentId, :drPrefix)";
            const exprVals: Record<string, any> = {
                ":drPrefix": "DROP_REQUEST#",
            };

            if (status && status !== "all") {
                filterExpr += " AND #st = :st";
                exprVals[":st"] = status;
            }

            const scanRes = await docClient.send(
                new ScanCommand({
                    TableName: "SocialAndContent",
                    FilterExpression: filterExpr,
                    ExpressionAttributeNames: (status && status !== "all") ? { "#st": "status" } : undefined,
                    ExpressionAttributeValues: exprVals,
                    Limit: 100,
                })
            );

            if (scanRes.Items && scanRes.Items.length > 0) {
                requests = scanRes.Items.map((item) => ({
                    id: item.id || (item.contentId as string).replace(/^DROP_REQUEST#/, ""),
                    ...item,
                }));
            }
        } catch (e) {
            console.warn("[request-drop GET] DynamoDB notice:", e);
        }

        if (requests.length === 0 && db) {
            let query: FirebaseFirestore.Query = db.collection("dropRequests").orderBy("createdAt", "desc");
            if (status && status !== "all") {
                query = query.where("status", "==", status);
            }
            const snapshot = await query.limit(limit).get();
            requests = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        }

        requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const stats = {
            total: requests.length,
            pending: requests.filter(doc => doc.status === "pending").length,
            approved: requests.filter(doc => doc.status === "approved").length,
            rejected: requests.filter(doc => doc.status === "rejected").length,
            completed: requests.filter(doc => doc.status === "completed").length,
        };

        return NextResponse.json({ 
            success: true, 
            requests: requests.slice(0, limit),
            stats,
            count: requests.length
        });
    } catch (error: unknown) {
        console.error("Request drop GET error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch requests" },
            { status: 500 }
        );
    }
}