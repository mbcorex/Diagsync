import { config } from "dotenv";
config();

import { Department, FieldType, PrismaClient, TestType } from "@prisma/client";

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

type FieldSeed = {
  label: string;
  fieldKey: string;
  fieldType: FieldType;
  unit?: string;
  normalMin?: number;
  normalMax?: number;
  normalText?: string;
  referenceNote?: string;
  options?: string;
  isRequired?: boolean;
  sortOrder: number;
};

type TestSeed = {
  code: string;
  name: string;
  description: string;
  sampleType: string;
  turnaroundMinutes: number;
  fields: FieldSeed[];
};

const TESTS: TestSeed[] = [
  {
    code: "WBC",
    name: "White Blood Cell Count",
    description: "Standalone white blood cell count",
    sampleType: "EDTA Blood",
    turnaroundMinutes: 60,
    fields: [
      {
        label: "WBC Count",
        fieldKey: "wbc_count",
        fieldType: FieldType.NUMBER,
        unit: "x10^9/L",
        normalMin: 4,
        normalMax: 11,
        referenceNote: "Adult white blood cell count. Reference ranges may vary by age and lab.",
        sortOrder: 1,
      },
      {
        label: "Comments",
        fieldKey: "comments",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
        sortOrder: 2,
      },
    ],
  },
  {
    code: "RBC",
    name: "Red Blood Cell Count",
    description: "Standalone red blood cell count",
    sampleType: "EDTA Blood",
    turnaroundMinutes: 60,
    fields: [
      {
        label: "RBC Count",
        fieldKey: "rbc_count",
        fieldType: FieldType.NUMBER,
        unit: "x10^12/L",
        normalMin: 4.2,
        normalMax: 5.9,
        referenceNote: "Adult red blood cell count. Reference ranges may vary by sex, age, altitude, and lab.",
        sortOrder: 1,
      },
      {
        label: "Comments",
        fieldKey: "comments",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
        sortOrder: 2,
      },
    ],
  },
];

async function resolveOrganizations() {
  const targetOrgId = (process.env.TARGET_ORG_ID ?? process.env.SEED_ORGANIZATION_ID ?? "").trim();
  const targetOrgEmail = (process.env.SEED_ORGANIZATION_EMAIL ?? "").trim();

  if (targetOrgId) {
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { id: true, name: true },
    });
    return org ? [org] : [];
  }

  if (targetOrgEmail) {
    const org = await prisma.organization.findUnique({
      where: { email: targetOrgEmail },
      select: { id: true, name: true },
    });
    return org ? [org] : [];
  }

  return prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function main() {
  const organizations = await resolveOrganizations();
  if (organizations.length === 0) {
    throw new Error("No organization found. Run the full seed first or set TARGET_ORG_ID / SEED_ORGANIZATION_EMAIL.");
  }

  const category = await prisma.testCategory.upsert({
    where: { id: "cat-haematology" },
    update: {
      name: "Haematology",
      description: "Blood count and related tests",
    },
    create: {
      id: "cat-haematology",
      name: "Haematology",
      description: "Blood count and related tests",
    },
  });

  console.log(`Seeding WBC and RBC tests for ${organizations.length} organization(s)...`);

  for (const organization of organizations) {
    console.log(`Target organization: ${organization.name} (${organization.id})`);

    for (const testSeed of TESTS) {
      const test = await prisma.$transaction(async (tx) => {
        const created = await tx.diagnosticTest.upsert({
          where: {
            organizationId_code: {
              organizationId: organization.id,
              code: testSeed.code,
            },
          },
          update: {
            categoryId: category.id,
            name: testSeed.name,
            type: TestType.LAB,
            department: Department.LABORATORY,
            price: 0,
            turnaroundMinutes: testSeed.turnaroundMinutes,
            sampleType: testSeed.sampleType,
            description: testSeed.description,
            isActive: true,
          },
          create: {
            organizationId: organization.id,
            categoryId: category.id,
            name: testSeed.name,
            code: testSeed.code,
            type: TestType.LAB,
            department: Department.LABORATORY,
            price: 0,
            turnaroundMinutes: testSeed.turnaroundMinutes,
            sampleType: testSeed.sampleType,
            description: testSeed.description,
          },
        });

        await tx.resultTemplateField.deleteMany({ where: { testId: created.id } });
        await tx.resultTemplateField.createMany({
          data: testSeed.fields.map((field) => ({
            testId: created.id,
            label: field.label,
            fieldKey: field.fieldKey,
            fieldType: field.fieldType,
            unit: field.unit ?? null,
            normalMin: field.normalMin ?? null,
            normalMax: field.normalMax ?? null,
            normalText: field.normalText ?? null,
            referenceNote: field.referenceNote ?? null,
            options: field.options ?? null,
            isRequired: field.isRequired ?? true,
            sortOrder: field.sortOrder,
          })),
        });

        return created;
      });

      console.log(`Upserted ${test.name} (${test.code})`);
    }
  }
}

main()
  .catch((error) => {
    console.error("[SEED_BLOOD_COUNTS]", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
