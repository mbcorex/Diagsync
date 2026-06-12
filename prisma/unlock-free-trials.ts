import { config } from "dotenv";
config();

import { PrismaClient, Role } from "@prisma/client";

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

async function main() {
  console.log("Unlocking free trials for organizations...");
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    where: {
      OR: [
        { status: { not: "TRIAL_ACTIVE" } },
        { plan: { not: "TRIAL" } },
        { trialStartedAt: null },
        { trialEndsAt: null },
      ],
    },
  });

  console.log(`Found ${orgs.length} organizations to update`);

  const results: { id: string; updated: boolean; note?: string }[] = [];

  for (const org of orgs) {
    try {
      const updated = await prisma.organization.update({
        where: { id: org.id },
        data: {
          plan: "TRIAL",
          status: "TRIAL_ACTIVE",
          trialStartedAt: now,
          trialEndsAt,
          billingLockedAt: null,
          billingLockReason: null,
          images: org.images ?? [],
        },
      });

      // Try to find a sensible actor for the audit log (prefer SUPER_ADMIN / MEGA_ADMIN)
      const actor = await prisma.staff.findFirst({
        where: {
          organizationId: org.id,
          role: { in: [Role.SUPER_ADMIN, Role.MEGA_ADMIN] },
        },
      });

      if (actor) {
        await prisma.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: "ORGANIZATION_UPDATED",
            entityType: "Organization",
            entityId: org.id,
            newValue: {
              plan: updated.plan,
              status: updated.status,
              trialStartedAt: updated.trialStartedAt?.toISOString(),
              trialEndsAt: updated.trialEndsAt?.toISOString(),
            },
            notes: "Bulk unlocked free trial",
          },
        });
        results.push({ id: org.id, updated: true });
        console.log(`Updated org ${org.email} (${org.id}) — audit logged by ${actor.email}`);
      } else {
        // No actor found; still update organization but note missing actor
        results.push({ id: org.id, updated: true, note: "no actor found" });
        console.log(`Updated org ${org.email} (${org.id}) — no local admin found for audit`);
      }
    } catch (err) {
      console.error(`Failed to update org ${org.email} (${org.id}):`, err);
      results.push({ id: org.id, updated: false, note: String(err) });
    }
  }

  const succeeded = results.filter((r) => r.updated).length;
  const failed = results.length - succeeded;
  console.log(`Done. ${succeeded} updated, ${failed} failed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
