// src/app/api/uploads/imaging/route.ts
import { NextRequest, NextResponse } from "next/server";
import { uploadToCloudinarySigned } from "@/lib/cloudinary";
import { auth } from "@/lib/auth";
import { requireOrganizationFeature } from "@/lib/billing-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    await requireOrganizationFeature(user.organizationId, "imaging");

    const form = await req.formData();
    const file = form.get("file");
    const taskId = form.get("taskId") as string;

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    if (!taskId) {
      return NextResponse.json({ success: false, error: "Task ID required" }, { status: 400 });
    }

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "File too large (max 25MB)" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Only JPEG, PNG, WebP images and PDF files are allowed" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadJson = await uploadToCloudinarySigned({
      fileType: file.type,
      buffer,
      folder: `diagsync/imaging/${taskId}`,
    });

    // Save to database
    const { prisma } = await import("@/lib/prisma");
    const imagingFile = await prisma.imagingFile.create({
      data: {
        organizationId: user.organizationId,
        taskId,
        uploadedById: user.id,
        fileUrl: uploadJson.secure_url,
        fileType: file.type,
        fileName: file.name,
        fileSizeBytes: file.size,
        metadata: {
          publicId: uploadJson.public_id,
          width: uploadJson.width,
          height: uploadJson.height,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: imagingFile.id,
        fileUrl: imagingFile.fileUrl,
        fileName: imagingFile.fileName,
        fileType: imagingFile.fileType,
        fileSizeBytes: imagingFile.fileSizeBytes,
        createdAt: imagingFile.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BILLING_LOCKED") {
      return NextResponse.json(
        { success: false, error: "Billing access required. Please choose or renew a plan." },
        { status: 403 }
      );
    }
    if (error instanceof Error && error.message === "FEATURE_NOT_AVAILABLE") {
      return NextResponse.json(
        { success: false, error: "Imaging upload is available on Trial or Advanced plan." },
        { status: 403 }
      );
    }
    console.error("[IMAGING_UPLOAD]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("id");

    if (!fileId) {
      return NextResponse.json({ success: false, error: "File ID required" }, { status: 400 });
    }

    const { prisma } = await import("@/lib/prisma");
    const imagingFile = await prisma.imagingFile.findFirst({
      where: { id: fileId, organizationId: user.organizationId },
    });

    if (!imagingFile) {
      return NextResponse.json({ success: false, error: "File not found" }, { status: 404 });
    }

    await prisma.imagingFile.delete({ where: { id: fileId } });

    return NextResponse.json({ success: true, message: "File deleted" });
  } catch (error) {
    console.error("[IMAGING_DELETE]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}