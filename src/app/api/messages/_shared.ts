import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationCoreAccess } from "@/lib/billing-service";

export const staffPreviewSelect = {
  id: true,
  fullName: true,
  role: true,
  department: true,
  availabilityStatus: true,
} as const;

export type StaffPreview = {
  id: string;
  fullName: string;
  role: Role;
  department: string;
  availabilityStatus: string;
};

export async function getMessageSession() {
  const session = await auth();
  if (!session?.user) {
    return { error: { status: 401, message: "Unauthorized" as const } };
  }

  const user = session.user as any;
  if (!user.organizationId || user.role === "MEGA_ADMIN") {
    return { error: { status: 403, message: "Forbidden" as const } };
  }

  await requireOrganizationCoreAccess(user.organizationId);

  return {
    user: {
      id: String(user.id),
      role: user.role as Role,
      organizationId: String(user.organizationId),
    },
  };
}

export async function resolveStaffInOrg(organizationId: string, staffId: string) {
  return prisma.staff.findFirst({
    where: { id: staffId, organizationId },
    select: staffPreviewSelect,
  });
}
