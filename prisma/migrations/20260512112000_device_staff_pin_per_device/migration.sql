-- Store quick-switch PIN per device-staff link, not globally on staff.
ALTER TABLE "device_staff"
ADD COLUMN IF NOT EXISTS "pinHash" TEXT,
ADD COLUMN IF NOT EXISTS "pinSetAt" TIMESTAMP(3);

