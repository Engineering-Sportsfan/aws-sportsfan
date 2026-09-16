import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export const runtime = 'nodejs';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export async function POST(req: NextRequest) {
    try {
        const text = await req.text();
        const body = text ? JSON.parse(text) : {};
        const { fileName, mimeType, description, author, sport } = body;

        if (!process.env.GOOGLE_DRIVE_CREDENTIALS) {
            throw new Error("Missing GOOGLE_DRIVE_CREDENTIALS environment variable");
        }

        const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: SCOPES,
        });

        const token = await auth.getAccessToken();

        // Standardize the filename
        let cleanName = fileName ? fileName.replace(/[^a-zA-Z0-9_.-]/g, '_') : `FlipLong-${Date.now()}.mp4`;
        if (!cleanName.startsWith('FlipLong-')) cleanName = `FlipLong-${cleanName}`;

        const metadata = {
            name: cleanName,
            parents: ['1nXkFEAAmgHnXG_Udrh9QOu0rVjckw6b4'], // Dinod's AI_Video_input folder
            description: description || 'FlipLong User Video Drop',
            properties: {
                source: 'fliplong',
                author: author || '',
                sport: sport || 'general',
            },
        };

        const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Type': mimeType || 'video/mp4',
                'Origin': req.headers.get('origin') || '*'
            },
            body: JSON.stringify(metadata)
        });

        if (!initRes.ok) {
            const errText = await initRes.text();
            throw new Error(`Google Drive Init Error: ${errText}`);
        }

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
        console.error("[flipLong-init] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
