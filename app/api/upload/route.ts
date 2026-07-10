import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file found" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const uploadRes = await cloudinary.uploader.upload(base64, {
      folder: "team360",
    });

    return NextResponse.json({
      success: true,
      url: uploadRes.secure_url,
      public_id: uploadRes.public_id,
    });
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    return NextResponse.json(
      { success: false, message: "Upload failed" },
      { status: 500 }
    );
  }
}