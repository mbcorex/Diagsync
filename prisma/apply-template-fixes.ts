import { config } from "dotenv";
config();

import { FieldType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type FieldDef = {
  label: string;
  fieldKey: string;
  fieldType: FieldType;
  unit?: string | null;
  normalMin?: number;
  normalMax?: number;
  normalText?: string | null;
  referenceNote?: string | null;
  options?: string | null;
  isRequired?: boolean;
};

type TemplateFix = {
  match: (name: string, code: string) => boolean;
  label: string;
  fields: FieldDef[];
};

const TEMPLATE_FIXES: TemplateFix[] = [
  {
    label: "HbA1c",
    match: (name, code) => /hba1c/i.test(name) || /hba1c/i.test(code),
    fields: [
      {
        label: "HbA1c",
        fieldKey: "hba1c",
        fieldType: FieldType.NUMBER,
        unit: "%",
        normalMin: 0.0,
        normalMax: 6.5,
        isRequired: true,
      },
      {
        label: "Interpretation",
        fieldKey: "interpretation",
        fieldType: FieldType.DROPDOWN,
        options: "Normal (<5.7%),Prediabetes (5.7-6.4%),Diabetes (>=6.5%)",
        isRequired: false,
      },
      {
        label: "Estimated Average Glucose",
        fieldKey: "eag",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        isRequired: false,
      },
      {
        label: "Comments",
        fieldKey: "comments",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
      },
    ],
  },
  {
    label: "Mantoux Test",
    match: (name, code) => /mantoux/i.test(name) || /mantoux/i.test(code),
    fields: [
      {
        label: "Result",
        fieldKey: "result",
        fieldType: FieldType.DROPDOWN,
        options: "Positive,Negative",
        normalText: "Negative",
        isRequired: true,
      },
      {
        label: "Interpretation",
        fieldKey: "interpretation",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
      },
    ],
  },
];

async function main() {
  const targetOrgId = process.env.TARGET_ORG_ID?.trim();
  const dryRun = process.env.DRY_RUN === "1";

  const tests = await prisma.diagnosticTest.findMany({
    where: {
      ...(targetOrgId ? { organizationId: targetOrgId } : {}),
      OR: TEMPLATE_FIXES.map((fix) => ({
        OR: [
          { name: { contains: fix.label, mode: "insensitive" as const } },
          { code: { contains: fix.label, mode: "insensitive" as const } },
        ],
      })),
    },
    include: {
      resultFields: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const matched = tests
    .map((test) => {
      const fix = TEMPLATE_FIXES.find((candidate) => candidate.match(test.name, test.code));
      return fix ? { test, fix } : null;
    })
    .filter((value): value is { test: (typeof tests)[number]; fix: TemplateFix } => value !== null);

  if (matched.length === 0) {
    console.log("No matching tests found.");
    return;
  }

  for (const { test, fix } of matched) {
    console.log(`${dryRun ? "Would update" : "Updating"} ${test.name} (${test.code}) in org ${test.organizationId}`);
    console.log(`  existing fields: ${test.resultFields.map((field) => field.fieldKey).join(", ") || "none"}`);
    console.log(`  new fields: ${fix.fields.map((field) => field.fieldKey).join(", ")}`);

    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      await tx.resultTemplateField.deleteMany({ where: { testId: test.id } });
      await tx.resultTemplateField.createMany({
        data: fix.fields.map((field, index) => ({
          testId: test.id,
          label: field.label,
          fieldKey: field.fieldKey,
          fieldType: field.fieldType,
          unit: field.unit ?? null,
          normalMin: field.normalMin,
          normalMax: field.normalMax,
          normalText: field.normalText ?? null,
          referenceNote: field.referenceNote ?? null,
          options: field.options ?? null,
          isRequired: field.isRequired ?? true,
          sortOrder: index,
        })),
      });
    });
  }

  console.log(dryRun ? "Dry run complete." : "Template fixes applied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
