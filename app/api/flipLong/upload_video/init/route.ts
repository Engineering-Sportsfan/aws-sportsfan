import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FOLDER_ID = "1nXkFEAAmgHnXG_Udrh9QOu0rVjckw6b4"; // Dinod's AI_Video_input folder
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file";

/**
 * Normalizes credentials and private key line breaks
 */
function normalizePrivateKey(creds: any): { client_email: string; private_key: string } {
  if (!creds || typeof creds !== "object") {
    throw new Error("Parsed credentials is not an object");
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GOOGLE_DRIVE_CREDENTIALS must contain client_email and private_key");
  }

  let key = String(creds.private_key).replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();

  return {
    client_email: String(creds.client_email).trim(),
    private_key: key,
  };
}

/**
 * Extremely resilient parser for GOOGLE_DRIVE_CREDENTIALS in .env
 * Automatically recovers from:
 * - Bad escaped characters in JSON (e.g. \_ \s \/ in private key)
 * - Base64 encoded JSON strings
 * - Single/double quoted JSON strings
 * - Regex extraction fallback for malformed JSON
 */
function parseGoogleCredentials(raw: string | object): { client_email: string; private_key: string } {
  if (typeof raw === "object" && raw !== null) {
    return normalizePrivateKey(raw);
  }
  if (typeof raw !== "string") {
    throw new Error("GOOGLE_DRIVE_CREDENTIALS is not a valid string or object");
  }

  let str = raw.trim();

  // Strip leading/trailing surrounding quotes from .env
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    str = str.slice(1, -1).trim();
  }

  // 1. Direct JSON.parse
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === "object") {
      return normalizePrivateKey(parsed);
    }
  } catch {}

  // 2. Base64 decoded JSON
  try {
    const decoded = Buffer.from(str, "base64").toString("utf-8");
    if (decoded.includes("client_email") || decoded.includes("private_key")) {
      const parsed = JSON.parse(decoded);
      return normalizePrivateKey(parsed);
    }
  } catch {}

  // 3. Fix unescaped control characters / bad escape sequences
  try {
    const fixed = str.replace(/\\([^"\\\/bfnrtu])/g, "$1");
    const parsed = JSON.parse(fixed);
    if (parsed && typeof parsed === "object") {
      return normalizePrivateKey(parsed);
    }
  } catch {}

  // 4. Regex fallback extraction
  const emailMatch = str.match(/"client_email"\s*:\s*"([^"]+)"/);
  const keyMatch = str.match(/"private_key"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (emailMatch && keyMatch) {
    return normalizePrivateKey({
      client_email: emailMatch[1],
      private_key: keyMatch[1],
    });
  }

  throw new Error(
    "Could not parse GOOGLE_DRIVE_CREDENTIALS. Ensure your service account JSON is in backend/.env"
  );
}

/**
 * Pure Node.js zero-dependency Service Account Token Generator
 * Uses native crypto to generate signed RS256 JWT assertions for Google OAuth2
 */
async function getServiceAccountToken(credentials: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claimSet = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GOOGLE_SCOPES,
      aud: GOOGLE_TOKEN_URI,
      exp,
      iat,
    })
  ).toString("base64url");

  const signatureInput = `${header}.${claimSet}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signatureInput);
  sign.end();
  const signature = sign.sign(credentials.private_key, "base64url");
  const jwt = `${signatureInput}.${signature}`;

  const tokenRes = await fetch(GOOGLE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth2 Token Error (${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("No access_token returned in Google OAuth2 response");
  }

  return tokenData.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    const body = text ? JSON.parse(text) : {};
    const { fileName, mimeType, description, author, sport } = body;

    const rawCreds = process.env.GOOGLE_DRIVE_CREDENTIALS;
    if (!rawCreds) {
      console.error("[flipLong-init] Error: Missing GOOGLE_DRIVE_CREDENTIALS in backend/.env");
      return NextResponse.json(
        {
          error: "Missing GOOGLE_DRIVE_CREDENTIALS environment variable in backend/.env",
          solution: "Please add your Google Service Account JSON to backend/.env under GOOGLE_DRIVE_CREDENTIALS",
        },
        { status: 500 }
      );
    }

    // Parse credentials using resilient multi-format parser with bad-escape sanitizer
    const credentials = parseGoogleCredentials(rawCreds);

    // Generate OAuth2 token using native crypto
    const token = await getServiceAccountToken(credentials);

    // Standardize filename
    let cleanName = fileName ? fileName.replace(/[^a-zA-Z0-9_.-]/g, "_") : `FlipLong-${Date.now()}.mp4`;
    if (!cleanName.startsWith("FlipLong-")) cleanName = `FlipLong-${cleanName}`;

    const metadata = {
      name: cleanName,
      parents: [GOOGLE_DRIVE_FOLDER_ID],
      description: description || "FlipLong User Video Drop",
      properties: {
        source: "fliplong",
        author: author || "",
        sport: sport || "general",
      },
    };

    const initRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType || "video/mp4",
          Origin: req.headers.get("origin") || "*",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new Error(`Google Drive Resumable Init Error (${initRes.status}): ${errText}`);
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("No Location header returned from Google Drive API");
    }

    return NextResponse.json(
      {
        success: true,
        uploadUrl,
        fileName: metadata.name,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[flipLong-init] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to initialize Google Drive upload",
      },
      { status: 500 }
    );
  }
}
