import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    if (cloudName && uploadPreset) {
      return NextResponse.json({
        success: true,
        provider: "cloudinary",
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
        uploadPreset,
      });
    }

    return NextResponse.json({ success: false, error: "No unsigned upload configured" }, { status: 501 });
  } catch (error) {
    console.error("[UPLOADS_PRESIGN]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
