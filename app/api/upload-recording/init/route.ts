import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export const runtime = 'nodejs';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export async function POST(req: NextRequest) {
    try {
        const text = await req.text();
        const body = text ? JSON.parse(text) : {};
        const { fileName, mimeType, part, sessionId } = body;

        if (!process.env.GOOGLE_DRIVE_CREDENTIALS) {
            throw new Error("Missing GOOGLE_DRIVE_CREDENTIALS");
        }

        const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: SCOPES,
        });

        // Initialize Google Drive API
        // We use the direct fetch API here to get the resumable URI easily, 
        // because googleapis library doesn't easily expose the raw Resumable URL.
        const token = await auth.getAccessToken();

        const metadata = {
            name: fileName || `Watchroom-Recording-${Date.now()}.webm`,
            parents: ['1nXkFEAAmgHnXG_Udrh9QOu0rVjckw6b4'], // Dinod's AI_Video_input folder
        };

        const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Type': mimeType || 'video/webm',
                'Origin': req.headers.get('origin') || '*'
            },
            body: JSON.stringify(metadata)
        });

        if (!initRes.ok) {
            const errText = await initRes.text();
            throw new Error(`Google Drive Init Error: ${errText}`);
        }

        // The upload URL is returned in the 'Location' header
        const uploadUrl = initRes.headers.get('Location');

        if (!uploadUrl) {
            throw new Error("No Location header returned from Google Drive");
        }

        return NextResponse.json({
            success: true,
            uploadUrl,
            fileName: metadata.name
        }, { status: 200 });

    } catch (error: any) {
        console.error("[upload-init] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
