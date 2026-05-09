// src/app/api/radiology/tasks/[taskId]/images/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    
    const user = session.user as any;
    const taskId = params.taskId;
    
    const task = await prisma.routingTask.findFirst({
      where: { id: taskId, organizationId: user.organizationId },
      select: { id: true },
    });
    
    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }
    
    const images = await prisma.imagingFile.findMany({
      where: { taskId, organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json({ success: true, data: images });
  } catch (error) {
    console.error("[TASK_IMAGES_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}