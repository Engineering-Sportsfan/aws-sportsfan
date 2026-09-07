import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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

        return NextResponse.json({ success: true, token });
    } catch (error) {
        console.error("JWT Generation error:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
