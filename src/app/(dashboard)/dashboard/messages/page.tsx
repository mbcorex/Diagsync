import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrganizationCoreAccess } from "@/lib/billing-service";
import { MessagesWorkspace } from "@/components/messages/messages-workspace";

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (!user.organizationId || user.role === "MEGA_ADMIN") redirect("/dashboard");

  await requireOrganizationCoreAccess(user.organizationId);

  const staff = await prisma.staff.findFirst({
    where: { id: user.id, organizationId: user.organizationId },
    select: { fullName: true },
  });

  if (!staff) redirect("/dashboard");

  return <MessagesWorkspace currentUserId={user.id} currentUserName={staff.fullName} />;
}
