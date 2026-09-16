import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { docClient } from '@/lib/dynamodb';
import { TABLES } from '@/lib/tableNames';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

// Use the exact secrets we configured on the EC2 server!
const JITSI_APP_ID = "sportsfan_app";
const JITSI_APP_SECRET = "super_secure_sportsfan_secret_2026";
const JITSI_ISSUER = "sportsfan";
const JITSI_AUDIENCE = "sportsfan";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { roomName, userName, userEmail, avatarUrl, role } = body;

        if (!roomName || !userName) {
            return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
        }

        // Determine if this user gets moderator privileges based on their role
        const isModerator = role === 'Host' || role === 'Co-Host' || role === 'Moderator';

        const payload = {
            context: {
                user: {
                    name: userName,
                    email: userEmail || "user@sportsfan360.com",
                    avatar: avatarUrl || "",
                    id: userName.toLowerCase().replace(/\s+/g, '-') + "-" + Date.now()
                },
                features: {
                    livestreaming: isModerator,
                    recording: isModerator,
                    // Disable screen sharing and outbound recording for viewers
                    screenSharing: isModerator
                }
            },
            aud: JITSI_AUDIENCE,
            iss: JITSI_ISSUER,
            sub: JITSI_APP_ID, // Usually required to match APP_ID in Jitsi configs
            room: "*", // Wildcard prevents strict casing mismatches in Jitsi room names
            moderator: isModerator,
            // Expire token in 4 hours
            exp: Math.floor(Date.now() / 1000) + (4 * 3600)
        };

        // Jitsi strictly requires the JWT header to contain a 'kid' matching the APP_ID
        const token = jwt.sign(payload, JITSI_APP_SECRET, {
            algorithm: 'HS256',
            header: { kid: JITSI_APP_ID, alg: 'HS256' }
        } as any);

        // Record attendee presence in DynamoDB RealTimeChat
        try {
            const cleanEmail = (userEmail || "").trim().toLowerCase();
            const participantId = (cleanEmail || userName || "guest").replace(/[^a-zA-Z0-9]/g, "_");
            const sanitizedRoom = roomName.startsWith("ROOM#") ? roomName : `ROOM#${roomName}`;
            const now = Date.now();

            await docClient.send(
                new PutCommand({
                    TableName: TABLES.RealTimeChat,
                    Item: {
                        roomId: sanitizedRoom,
                        sk: `PRESENCE#${participantId}`,
                        participantId,
                        userName,
                        userEmail: cleanEmail,
                        avatarUrl: avatarUrl || "",
                        role: role || "Viewer",
                        isModerator,
                        joinedAt: now,
                        lastSeenAt: now,
                        type: "watchalong_presence",
                    }
                })
            );
        } catch (presenceErr) {
            console.warn("[WatchAlong Token] Presence logging notice:", presenceErr);
        }

        return NextResponse.json({ success: true, token });
    } catch (error) {
        console.error("JWT Generation error:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
