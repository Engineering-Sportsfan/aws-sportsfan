import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import stream from 'stream';
import path from 'path';

export const runtime = 'nodejs';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('video') as Blob | null;

        if (!file) {
            return NextResponse.json({ error: "No video file provided" }, { status: 400 });
        }

        // --- 30-min chunking metadata ---
        const part = formData.get('part') ? parseInt(formData.get('part') as string, 10) : null;
        const sessionId = formData.get('sessionId') as string | null;
        const isFinal = formData.get('isFinal') === 'true';
        const mimeType = (formData.get('mimeType') as string | null) || 'video/webm';

        const buffer = Buffer.from(await file.arrayBuffer());

        // ENTERPRISE PROTOCOL: Parse credentials from ENV variable
        if (!process.env.GOOGLE_DRIVE_CREDENTIALS) {
            throw new Error("Missing GOOGLE_DRIVE_CREDENTIALS environment variable");
        }

        const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);

        // Authenticate with the Service Account using credentials object
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: SCOPES,
        });

        const drive = google.drive({ version: 'v3', auth });

        // Convert the video buffer to a readable stream
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        // Build the Drive file name
        // - If this is a chunked upload: Watchroom-Recording-{sessionId}-Part-{01}.webm
        // - If legacy (no part info):   Watchroom-Recording-{date}.webm
        let fileName: string;
        if (part !== null && sessionId) {
            const partStr = String(part).padStart(2, '0');
            fileName = `Watchroom-Recording-${sessionId}-Part-${partStr}.webm`;
        } else {
            fileName = `Watchroom-Recording-${new Date().toISOString().split('T')[0]}.webm`;
        }

        console.log(`[upload-recording] Uploading "${fileName}" (${(buffer.length / 1024 / 1024).toFixed(1)} MB) | part=${part ?? 'single'} | isFinal=${isFinal}`);

        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: ['1nXkFEAAmgHnXG_Udrh9QOu0rVjckw6b4'], // Dinod's AI_Video_input folder
            },
            media: {
                mimeType: mimeType,
                body: bufferStream,
            },
            fields: 'id, webViewLink, name',
            supportsAllDrives: true,
        });

        console.log(`[upload-recording] ✅ Saved: ${response.data.name} | Drive ID: ${response.data.id}`);

        return NextResponse.json({
            success: true,
            file: response.data,
            name: response.data.name,
            part: part ?? 1,
            isFinal,
        }, { status: 200 });

    } catch (error: any) {
        console.error("[upload-recording] Error uploading to Google Drive:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
