import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const debug = (process.env.DEBUG || "false").toLowerCase() === "true" || process.env.NODE_ENV !== "production";

  const envChecks = {
    databaseUrlSet: !!process.env.DATABASE_URL,
    directUrlSet: !!process.env.DIRECT_URL,
    catalogTemplateOrgIdSet: !!process.env.CATALOG_TEMPLATE_ORG_ID,
    nodeEnv: process.env.NODE_ENV ?? "undefined",
  };

  let dbOk = false;
  let dbError: string | null = null;

  try {
    // simple lightweight check
    // @ts-ignore the return type can be number[] or similar depending on driver
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbOk = false;
    dbError = debug ? (err as any)?.stack ?? String(err) : "DB connection failed";
  }

  const payload: any = {
    ok: dbOk,
    env: envChecks,
  };

  if (!dbOk) payload.dbError = dbError;

  return NextResponse.json(payload, { status: dbOk ? 200 : 500 });
}
