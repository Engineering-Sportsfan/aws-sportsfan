import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import stream from 'stream';
import path from 'path';

export const runtime = 'nodejs';

// Remove the file path completely
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('video') as Blob | null;
        
        if (!file) {
            return NextResponse.json({ error: "No video file provided" }, { status: 400 });
        }

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

        console.log("Uploading video to Google Drive...");

        const response = await drive.files.create({
            requestBody: {
                name: `Watchroom-Recording-${new Date().toISOString().split('T')[0]}.webm`,
                parents: ['1nXkFEAAmgHnXG_Udrh9QOu0rVjckw6b4'], // Dinod's AI_Video_input folder
            },
            media: {
                mimeType: 'video/webm',
                body: bufferStream,
            },
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        });

        console.log("Google Drive upload successful:", response.data);

        return NextResponse.json({ success: true, file: response.data }, { status: 200 });

    } catch (error: any) {
        console.error("Error uploading to Google Drive:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
