import { config } from "dotenv";
config();

import { spawnSync } from "node:child_process";

const HOLY_SOULS_ORG_ID = "cmqmcob1a000n8rhw063x2dsz";
const targetOrgId = (process.env.TARGET_ORG_ID ?? HOLY_SOULS_ORG_ID).trim();

const STOOL_ANALYSIS_PLUS_OPTIONS = "Absent,+,++,+++,++++";

type FieldSeed = {
  label: string;
  fieldKey: string;
  fieldType: "NUMBER" | "TEXT" | "TEXTAREA" | "DROPDOWN" | "CHECKBOX";
  unit?: string | null;
  normalMin?: number | null;
  normalMax?: number | null;
  normalText?: string | null;
  referenceNote?: string | null;
  options?: string | null;
  isRequired?: boolean;
  sortOrder: number;
};

const LFT_FIELDS: FieldSeed[] = [
  { label: "Total Bilirubin", fieldKey: "total_bilirubin", fieldType: "NUMBER", unit: "\u00B5mol/L", normalMin: 3.4, normalMax: 17.1, referenceNote: "Male: 3.4-17.1 \u00B5mol/L; Female: 3.4-17.1 \u00B5mol/L.", sortOrder: 1 },
  { label: "Direct Bilirubin", fieldKey: "direct_bilirubin", fieldType: "NUMBER", unit: "\u00B5mol/L", normalMin: 1.7, normalMax: 6.8, referenceNote: "Male: 1.7-6.8 \u00B5mol/L; Female: 1.7-6.8 \u00B5mol/L.", sortOrder: 2 },
  { label: "ALT", fieldKey: "alt", fieldType: "NUMBER", unit: "U/L", normalMin: 9, normalMax: 50, referenceNote: "Male: 9-50 U/L; Female: 7-40 U/L.", sortOrder: 3 },
  { label: "AST", fieldKey: "ast", fieldType: "NUMBER", unit: "U/L", normalMin: 0, normalMax: 40, referenceNote: "Male: 0-40 U/L; Female: 0-31 U/L.", sortOrder: 4 },
  { label: "ALP", fieldKey: "alp", fieldType: "NUMBER", unit: "U/L", normalMin: 45, normalMax: 125, referenceNote: "Male: 45-125 U/L; Female: 35-150 U/L.", sortOrder: 5 },
  { label: "GGT", fieldKey: "ggt", fieldType: "NUMBER", unit: "U/L", normalMin: 10, normalMax: 60, referenceNote: "Male: 10-60 U/L; Female: 7-45 U/L.", sortOrder: 6 },
  { label: "AST/ALT ratio", fieldKey: "ast_alt_ratio", fieldType: "NUMBER", normalMin: 0.7, normalMax: 1.2, referenceNote: "Male: 0.7-1.2; Female: 0.7-1.2.", isRequired: false, sortOrder: 7 },
];

const STOOL_FIELDS: FieldSeed[] = [
  { label: "Colour", fieldKey: "colour", fieldType: "DROPDOWN", options: "Brown,Yellow,Black,Green,Red,Pale", sortOrder: 1 },
  { label: "Consistency", fieldKey: "consistency", fieldType: "DROPDOWN", options: "Formed,Semi-formed,Loose,Watery", sortOrder: 2 },
  { label: "Mucus", fieldKey: "mucus", fieldType: "DROPDOWN", options: "Absent,Present", sortOrder: 3 },
  { label: "Blood", fieldKey: "blood", fieldType: "DROPDOWN", options: "Absent,Present", sortOrder: 4 },
  { label: "Scolex", fieldKey: "scolex", fieldType: "DROPDOWN", options: "Absent,Present", isRequired: false, sortOrder: 5 },
  { label: "Trophozoites", fieldKey: "trophozoites", fieldType: "TEXT", isRequired: false, sortOrder: 6 },
  { label: "Cyst(s)", fieldKey: "cysts", fieldType: "DROPDOWN", options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 7 },
  { label: "Ova / Eggs", fieldKey: "ova_cyst", fieldType: "DROPDOWN", options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 8 },
  { label: "Yeast Cells", fieldKey: "yeast_cells", fieldType: "DROPDOWN", options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 9 },
  { label: "Starch Granules", fieldKey: "starch_granules", fieldType: "DROPDOWN", options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 10 },
  { label: "Calcium Oxalate", fieldKey: "calcium_oxalate", fieldType: "DROPDOWN", options: "Absent,Present", isRequired: false, sortOrder: 11 },
  { label: "Pus Cells (hpf)", fieldKey: "pus_cells", fieldType: "TEXT", isRequired: false, sortOrder: 12 },
  { label: "RBCs (hpf)", fieldKey: "rbcs", fieldType: "TEXT", isRequired: false, sortOrder: 13 },
  { label: "Occult Blood (FOB)", fieldKey: "occult_blood", fieldType: "DROPDOWN", options: "Reactive,Non-Reactive", isRequired: false, sortOrder: 14 },
  { label: "Comments", fieldKey: "comments", fieldType: "TEXTAREA", isRequired: false, sortOrder: 15 },
];

function sqlValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${value.replace(/'/g, "''")}'`;
}

function buildValueRow(testCode: string, field: FieldSeed) {
  return `(${[
    sqlValue(testCode),
    sqlValue(field.label),
    sqlValue(field.fieldKey),
    sqlValue(field.fieldType),
    sqlValue(field.unit ?? null),
    sqlValue(field.normalMin ?? null),
    sqlValue(field.normalMax ?? null),
    sqlValue(field.normalText ?? null),
    sqlValue(field.referenceNote ?? null),
    sqlValue(field.options ?? null),
    sqlValue(field.isRequired ?? true),
    sqlValue(field.sortOrder),
  ].join(", ")})`;
}

const rows = [
  ...LFT_FIELDS.map((field) => buildValueRow("LFT", field)),
  ...STOOL_FIELDS.map((field) => buildValueRow("STOOL", field)),
].join(",\n    ");

const sql = `
BEGIN;
WITH target_tests AS (
  SELECT id, code, name
  FROM "diagnostic_tests"
  WHERE "organizationId" = ${sqlValue(targetOrgId)}
    AND (
      code = 'LFT'
      OR UPPER(name) = 'LIVER FUNCTION TEST'
      OR code = 'STOOL'
      OR UPPER(name) = 'STOOL ANALYSIS'
    )
), deleted AS (
  DELETE FROM "result_template_fields" r
  USING target_tests t
  WHERE r."testId" = t.id
)
INSERT INTO "result_template_fields" (
  "id",
  "testId",
  "label",
  "fieldKey",
  "fieldType",
  "unit",
  "normalMin",
  "normalMax",
  "normalText",
  "referenceNote",
  "options",
  "isRequired",
  "sortOrder",
  "createdAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text),
  t.id,
  v.label,
  v.fieldKey,
  v.fieldType::"FieldType",
  v.unit,
  v.normalMin,
  v.normalMax,
  v.normalText,
  v.referenceNote,
  v.options,
  v.isRequired,
  v.sortOrder,
  NOW()
FROM target_tests t
JOIN LATERAL (
    VALUES
    ${rows}
) AS v(test_code, label, fieldKey, fieldType, unit, normalMin, normalMax, normalText, referenceNote, options, isRequired, sortOrder)
  ON t.code = v.test_code;
COMMIT;
`;

const result = spawnSync("npx", ["prisma", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], {
  shell: process.platform === "win32",
  input: sql,
  encoding: "utf8",
});

if (result.status !== 0) {
  if (result.error) console.error(result.error);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.status ?? 1);
}

if (result.stdout) console.log(result.stdout);


