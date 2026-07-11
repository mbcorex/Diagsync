import { config } from "dotenv";
config();

import { PrismaClient, Prisma, Department, TestType, FieldType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

type SeedField = {
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

const HOLY_SOULS_ORGANIZATION_ID = "cmqmcob1a000n8rhw063x2dsz";

function formatRangeNote(min: number | string, max: number | string, unit = "") {
  return `${min}-${max}${unit ? ` ${unit}` : ""}`;
}

function sameSexRangeNote(min: number | string, max: number | string, unit = "") {
  const range = formatRangeNote(min, max, unit);
  return `Male: ${range}; Female: ${range}.`;
}

function splitSexRangeNote(
  maleMin: number | string,
  maleMax: number | string,
  femaleMin: number | string,
  femaleMax: number | string,
  unit = ""
) {
  return `Male: ${formatRangeNote(maleMin, maleMax, unit)}; Female: ${formatRangeNote(femaleMin, femaleMax, unit)}.`;
}

const HOLY_SOULS_LFT_FIELDS: SeedField[] = [
  {
    label: "Total Bilirubin",
    fieldKey: "total_bilirubin",
    fieldType: FieldType.NUMBER,
    unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L",
    normalMin: 3.4,
    normalMax: 17.1,
    referenceNote: sameSexRangeNote(3.4, 17.1, "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L"),
    sortOrder: 1,
  },
  {
    label: "Direct Bilirubin",
    fieldKey: "direct_bilirubin",
    fieldType: FieldType.NUMBER,
    unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L",
    normalMin: 1.7,
    normalMax: 6.8,
    referenceNote: sameSexRangeNote(1.7, 6.8, "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L"),
    sortOrder: 2,
  },
  {
    label: "ALT",
    fieldKey: "alt",
    fieldType: FieldType.NUMBER,
    unit: "U/L",
    normalMin: 9,
    normalMax: 50,
    referenceNote: splitSexRangeNote(9, 50, 7, 40, "U/L"),
    sortOrder: 3,
  },
  {
    label: "AST",
    fieldKey: "ast",
    fieldType: FieldType.NUMBER,
    unit: "U/L",
    normalMin: 0,
    normalMax: 40,
    referenceNote: splitSexRangeNote(0, 40, 0, 31, "U/L"),
    sortOrder: 4,
  },
  {
    label: "ALP",
    fieldKey: "alp",
    fieldType: FieldType.NUMBER,
    unit: "U/L",
    normalMin: 45,
    normalMax: 125,
    referenceNote: splitSexRangeNote(45, 125, 35, 150, "U/L"),
    sortOrder: 5,
  },
  {
    label: "GGT",
    fieldKey: "ggt",
    fieldType: FieldType.NUMBER,
    unit: "U/L",
    normalMin: 10,
    normalMax: 60,
    referenceNote: splitSexRangeNote(10, 60, 7, 45, "U/L"),
    sortOrder: 6,
  },
  {
    label: "AST/ALT ratio",
    fieldKey: "ast_alt_ratio",
    fieldType: FieldType.NUMBER,
    unit: "",
    normalMin: 0.7,
    normalMax: 1.2,
    referenceNote: sameSexRangeNote(0.7, 1.2),
    isRequired: false,
    sortOrder: 7,
  },
];

const HOLY_SOULS_KFT_FIELDS: SeedField[] = [
  {
    label: "Urea",
    fieldKey: "urea",
    fieldType: FieldType.NUMBER,
    unit: "mmol/L",
    normalMin: 1.7,
    normalMax: 8.3,
    referenceNote: sameSexRangeNote(1.7, 8.3, "mmol/L"),
    sortOrder: 1,
  },
  {
    label: "Creatinine",
    fieldKey: "creatinine",
    fieldType: FieldType.NUMBER,
    unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L",
    normalMin: 59,
    normalMax: 104,
    referenceNote: splitSexRangeNote(59, 104, 45, 84, "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L"),
    sortOrder: 2,
  },
  {
    label: "Uric Acid",
    fieldKey: "uric_acid",
    fieldType: FieldType.NUMBER,
    unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L",
    normalMin: 200,
    normalMax: 480,
    referenceNote: splitSexRangeNote(200, 480, 140, 360, "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L"),
    sortOrder: 3,
  },
  {
    label: "Total Protein",
    fieldKey: "total_protein",
    fieldType: FieldType.NUMBER,
    unit: "g/L",
    normalMin: 60,
    normalMax: 88,
    referenceNote: sameSexRangeNote(60, 88, "g/L"),
    sortOrder: 4,
  },
  {
    label: "Albumin",
    fieldKey: "albumin",
    fieldType: FieldType.NUMBER,
    unit: "g/L",
    normalMin: 35,
    normalMax: 55,
    referenceNote: sameSexRangeNote(35, 55, "g/L"),
    sortOrder: 5,
  },
  {
    label: "Magnesium",
    fieldKey: "magnesium",
    fieldType: FieldType.NUMBER,
    unit: "mmol/L",
    normalMin: 0.7,
    normalMax: 1.1,
    referenceNote: sameSexRangeNote(0.7, 1.1, "mmol/L"),
    sortOrder: 6,
  },
  {
    label: "Ca (Calcium)",
    fieldKey: "calcium",
    fieldType: FieldType.NUMBER,
    unit: "mmol/L",
    normalMin: 2.02,
    normalMax: 2.6,
    referenceNote: sameSexRangeNote(2.02, 2.6, "mmol/L"),
    sortOrder: 7,
  },
  {
    label: "IP (Inorganic Phosphate)",
    fieldKey: "inorganic_phosphate",
    fieldType: FieldType.NUMBER,
    unit: "mmol/L",
    normalMin: 0.87,
    normalMax: 1.45,
    referenceNote: sameSexRangeNote(0.87, 1.45, "mmol/L"),
    sortOrder: 8,
  },
];

const HOLY_SOULS_FLP_FIELDS: SeedField[] = [
  {
    label: "Total Cholesterol",
    fieldKey: "cholesterol_total",
    fieldType: FieldType.NUMBER,
    unit: "mmol/L",
    normalMin: 3.5,
    normalMax: 5.12,
    referenceNote: sameSexRangeNote(3.5, 5.12, "mmol/L"),
    sortOrder: 1,
  },
  {
    label: "HDL",
    fieldKey: "hdl",
    fieldType: FieldType.NUMBER,
    unit: "mmol/L",
    normalMin: 1.04,
    normalMax: 1.55,
    referenceNote: sameSexRangeNote(1.04, 1.55, "mmol/L"),
    sortOrder: 2,
  },
  {
    label: "LDL",
    fieldKey: "ldl",
    fieldType: FieldType.NUMBER,
    unit: "mmol/L",
    normalMin: 1.57,
    normalMax: 3.37,
    referenceNote: sameSexRangeNote(1.57, 3.37, "mmol/L"),
    sortOrder: 3,
  },
  {
    label: "Triglycerides",
    fieldKey: "triglycerides",
    fieldType: FieldType.NUMBER,
    unit: "mmol/L",
    normalMin: 0.7,
    normalMax: 1.7,
    referenceNote: sameSexRangeNote(0.7, 1.7, "mmol/L"),
    sortOrder: 4,
  },
];

const STOOL_ANALYSIS_PLUS_OPTIONS = "Absent,+,++,+++,++++";

const HOLY_SOULS_STOOL_ANALYSIS_FIELDS: SeedField[] = [
  { label: "Colour", fieldKey: "colour", fieldType: FieldType.DROPDOWN, options: "Brown,Yellow,Black,Green,Red,Pale", sortOrder: 1 },
  { label: "Consistency", fieldKey: "consistency", fieldType: FieldType.DROPDOWN, options: "Formed,Semi-formed,Loose,Watery", sortOrder: 2 },
  { label: "Mucus", fieldKey: "mucus", fieldType: FieldType.DROPDOWN, options: "Absent,Present", sortOrder: 3 },
  { label: "Blood", fieldKey: "blood", fieldType: FieldType.DROPDOWN, options: "Absent,Present", sortOrder: 4 },
  { label: "Scolex", fieldKey: "scolex", fieldType: FieldType.DROPDOWN, options: "Absent,Present", isRequired: false, sortOrder: 5 },
  { label: "Trophozoites", fieldKey: "trophozoites", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 6 },
  { label: "Cyst(s)", fieldKey: "cysts", fieldType: FieldType.DROPDOWN, options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 7 },
  { label: "Ova / Eggs", fieldKey: "ova_cyst", fieldType: FieldType.DROPDOWN, options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 8 },
  { label: "Yeast Cells", fieldKey: "yeast_cells", fieldType: FieldType.DROPDOWN, options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 9 },
  { label: "Starch Granules", fieldKey: "starch_granules", fieldType: FieldType.DROPDOWN, options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 10 },
  { label: "Calcium Oxalate", fieldKey: "calcium_oxalate", fieldType: FieldType.DROPDOWN, options: "Absent,Present", isRequired: false, sortOrder: 11 },
  { label: "Pus Cells (hpf)", fieldKey: "pus_cells", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 12 },
  { label: "RBCs (hpf)", fieldKey: "rbcs", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 13 },
  { label: "Occult Blood (FOB)", fieldKey: "occult_blood", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", isRequired: false, sortOrder: 14 },
  { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 15 },
];

function getHolySoulsOverride(source: string) {
  const key = source.trim().toUpperCase();
  if (!key) return null;
  if (key === "LFT" || key.includes("LIVER FUNCTION TEST")) return HOLY_SOULS_LFT_FIELDS;
  if (key === "KFT" || key.includes("KIDNEY FUNCTION TEST") || key.includes("RENAL FUNCTION TEST")) return HOLY_SOULS_KFT_FIELDS;
    if (key === "FLP" || key.includes("FASTING LIPID PROFILE") || key.includes("LIPID PROFILE")) return HOLY_SOULS_FLP_FIELDS;
  if (key === "STOOL" || key.includes("STOOL ANALYSIS")) return HOLY_SOULS_STOOL_ANALYSIS_FIELDS;
  return null;
}

async function bootstrapMegaAdmin() {
  const megaAdminEmail = (process.env.mega_ADMIN_EMAIL ?? process.env.MEGA_ADMIN_EMAIL ?? "").trim();
  const megaAdminPassword = (process.env.mega_ADMIN_PASSWORD ?? process.env.MEGA_ADMIN_PASSWORD ?? "").trim();
  const megaAdminName = (process.env.mega_ADMIN_NAME ?? process.env.MEGA_ADMIN_NAME ?? "").trim();

  if (!megaAdminEmail || !megaAdminPassword || !megaAdminName) {
    throw new Error(
      "Missing required env vars: mega_ADMIN_EMAIL, mega_ADMIN_PASSWORD, mega_ADMIN_NAME"
    );
  }

  const existing = await prisma.staff.findUnique({
    where: { email: megaAdminEmail },
    select: { id: true },
  });

  if (existing) {
    console.log("mega admin already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(megaAdminPassword, 12);
  await prisma.staff.create({
    data: {
      fullName: megaAdminName,
      email: megaAdminEmail,
      phone: "+0000000000000",
      passwordHash,
      role: Role.MEGA_ADMIN,
      department: "HR_OPERATIONS",
      status: "ACTIVE",
      availabilityStatus: "UNAVAILABLE",
    },
    select: { id: true },
  });

  console.log("mega admin created");
}

async function main() {
  console.log("?? Seeding Tests...");
  await bootstrapMegaAdmin();

  // -- Seed Test Categories -----------------------------------------------------
  const categorySeeds = [
    { id: "cat-haematology", name: "Haematology", description: "Blood count and related tests" },
    { id: "cat-chemistry", name: "Clinical Chemistry", description: "Biochemistry and metabolic tests" },
    { id: "cat-micro", name: "Microbiology", description: "Infection and parasitology tests" },
    { id: "cat-urine", name: "Urinalysis", description: "Urine examination tests" },
    { id: "cat-imaging", name: "Imaging & Radiology", description: "X-Ray, Ultrasound, CT, MRI" },
    { id: "cat-cardiology", name: "Cardiology", description: "ECG, Echocardiography, and cardiovascular diagnostics" },
    { id: "cat-serology", name: "Serology / Immunology", description: "Antibody and antigen tests" },
  ] as const;

  const categories = [];
  for (const category of categorySeeds) {
    categories.push(
      await prisma.testCategory.upsert({
        where: { id: category.id },
        update: {},
        create: {
          id: category.id,
          name: category.name,
          description: category.description,
        },
      })
    );
  }

  console.log(`? ${categories.length} test categories created`);

  // -- Get Organization ---------------------------------------------------------
  const seedOrganizationId = (process.env.SEED_ORGANIZATION_ID ?? "").trim();
  const seedOrganizationEmail = (process.env.SEED_ORGANIZATION_EMAIL ?? "").trim();

  let org = seedOrganizationId
    ? await prisma.organization.findUnique({ where: { id: seedOrganizationId } })
    : seedOrganizationEmail
    ? await prisma.organization.findUnique({ where: { email: seedOrganizationEmail } })
    : await prisma.organization.findFirst();

  if (!org && (seedOrganizationId || seedOrganizationEmail)) {
    throw new Error(
      `Seed organization not found for ${seedOrganizationId ? `SEED_ORGANIZATION_ID=${seedOrganizationId}` : `SEED_ORGANIZATION_EMAIL=${seedOrganizationEmail}`}`
    );
  }
  if (!org) {
    const defaultAdminEmail = "admin@diagsync.local";
    const defaultAdminPassword = "Admin@123";
    const passwordHash = await bcrypt.hash(defaultAdminPassword, 10);

    org = await prisma.organization.create({
      data: {
        name: "DiagSync Demo Organization",
        email: "info@diagsync.local",
        phone: "+2340000000000",
        address: "Demo Address",
        staff: {
          create: {
            fullName: "DiagSync Super Admin",
            email: defaultAdminEmail,
            phone: "+2340000000001",
            passwordHash,
            role: "SUPER_ADMIN",
            department: "HR_OPERATIONS",
            status: "ACTIVE",
          },
        },
      },
    });

    console.log("? Created default organization and super admin");
    console.log(`   Admin email: ${defaultAdminEmail}`);
    console.log(`   Admin password: ${defaultAdminPassword}`);
  }

  const orgId = org.id;
  console.log(`? Organization found: ${org.name} (${org.id})`);

  const TEMPLATE_FIELD_CHUNK_SIZE = 100;
  const RADIOLOGY_DELETE_CHUNK_SIZE = 100;
  const DB_RETRY_LIMIT = 6;

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function mapTemplateFields(
    testId: string,
    fields: Array<{
      label: string;
      fieldKey: string;
      fieldType: FieldType;
      unit?: string | null;
      normalMin?: Prisma.Decimal | number | null;
      normalMax?: Prisma.Decimal | number | null;
      normalText?: string | null;
      referenceNote?: string | null;
      options?: string | null;
      isRequired?: boolean | null;
      sortOrder: number;
    }>
  ): Prisma.ResultTemplateFieldCreateManyInput[] {
    return fields.map((field) => ({
      testId,
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
    }));
  }

  function getPrismaErrorCode(error: unknown): string | undefined {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
    if (error instanceof Prisma.PrismaClientInitializationError) return error.errorCode;
    if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
      return (error as { code: string }).code;
    }
    return undefined;
  }

  function isRetryableDbCode(code?: string) {
    return code === "P1001" || code === "P1002" || code === "P1008" || code === "P1017";
  }

  async function runWithRetry<T>(label: string, action: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await action();
      } catch (error: unknown) {
        const code = getPrismaErrorCode(error);
        const retryable = isRetryableDbCode(code);
        if (!retryable || attempt >= DB_RETRY_LIMIT) {
          throw error;
        }
        attempt += 1;
        console.warn(`${label} failed (${code}), retrying ${attempt}/${DB_RETRY_LIMIT}...`);
        try {
          await prisma.$disconnect();
        } catch {
          // best effort
        }
        await delay(700 * attempt);
        try {
          await prisma.$connect();
        } catch (connectError: unknown) {
          const connectCode = getPrismaErrorCode(connectError);
          const reconnectRetryable = isRetryableDbCode(connectCode);
          if (!reconnectRetryable || attempt >= DB_RETRY_LIMIT) {
            throw connectError;
          }
          console.warn(
            `${label} reconnect failed (${connectCode}), retrying ${attempt}/${DB_RETRY_LIMIT}...`
          );
          continue;
        }
      }
    }
  }

  async function replaceResultTemplateFields(
    testId: string,
    rows: Prisma.ResultTemplateFieldCreateManyInput[],
    contextLabel: string
  ) {
    await runWithRetry(`${contextLabel}:deleteMany`, () =>
      prisma.resultTemplateField.deleteMany({ where: { testId } })
    );

    for (let i = 0; i < rows.length; i += TEMPLATE_FIELD_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + TEMPLATE_FIELD_CHUNK_SIZE);
      if (chunk.length === 0) continue;
      await runWithRetry(`${contextLabel}:createMany#${i / TEMPLATE_FIELD_CHUNK_SIZE + 1}`, () =>
        prisma.resultTemplateField.createMany({ data: chunk })
      );
    }
  }

  // -- Helper: upsert test + fields ------------------------------------------
  async function seedTest(data: {
    code: string;
    name: string;
    type: TestType;
    department: Department;
    categoryId: string;
    price: number;
    costPrice?: number;
    turnaroundMinutes: number;
    sampleType?: string;
    description?: string;
    groupKey?: string | null;
    viewType?: string | null;
    isDefaultInGroup?: boolean;
    fields: SeedField[];
  }) {
    const effectiveFields = getHolySoulsOverride(`${data.code} ${data.name}`) ?? data.fields;
    const enrichedFields = withReferenceMetadata(data.name, data.type, effectiveFields);

    const test = await prisma.diagnosticTest.upsert({
      where: { organizationId_code: { organizationId: orgId, code: data.code } },
      update: {
        name: data.name,
        price: data.price,
        costPrice: data.costPrice ?? Math.round(data.price * 0.55),
        categoryId: data.categoryId,
        type: data.type,
        department: data.department,
        turnaroundMinutes: data.turnaroundMinutes,
        sampleType: data.sampleType ?? null,
        description: data.description ?? null,
        isActive: true,
      },
      create: {
        organizationId: orgId,
        categoryId: data.categoryId,
        name: data.name,
        code: data.code,
        type: data.type,
        department: data.department,
        price: data.price,
        costPrice: data.costPrice ?? Math.round(data.price * 0.55),
        turnaroundMinutes: data.turnaroundMinutes,
        sampleType: data.sampleType,
        description: data.description,
      },
    });

    await prisma.$executeRaw`
      UPDATE "diagnostic_tests"
      SET "groupKey" = ${data.groupKey ?? null},
          "viewType" = ${data.viewType ?? null},
          "isDefaultInGroup" = ${data.isDefaultInGroup ?? false}
      WHERE "id" = ${test.id}
    `;

    await replaceResultTemplateFields(
      test.id,
      mapTemplateFields(test.id, enrichedFields),
      `seedTest:${data.code}`
    );

    return test;
  }

  const COMPLEX_REFERENCE_FIELDS = new Set([
    "amh",
    "psa_total",
    "psa_free",
    "fsh",
    "lh",
    "tsh",
    "testosterone",
    "ferritin",
    "estradiol",
    "progesterone",
    "prolactin",
    "dhea_s",
    "cortisol",
    "acth",
  ]);

  const NUMERIC_RANGE_OVERRIDES: Record<string, { min: number; max: number }> = {
    volume: { min: 1.4, max: 6.0 },
    sperm_concentration: { min: 15, max: 250 },
    induration: { min: 0, max: 4 },
  };
  const PRESERVE_SINGLE_BOUND_FIELD_KEYS = new Set([
    "cholesterol_total_mg_dl",
  ]);

  function isCultureTest(testName: string) {
    const n = testName.toLowerCase();
    return n.includes("m/c/s") || n.includes("culture");
  }

  function isQualitativeOnlyTest(testName: string) {
    const n = testName.toLowerCase();
    return n.includes("qualitative") || n.includes("screening") || n.includes("confirmatory");
  }

  function deriveNormalText(options?: string) {
    if (!options) return undefined;
    const list = options.split(",").map((item) => item.trim()).filter(Boolean);
    const preferred = [
      "Negative",
      "Non-Reactive",
      "Absent",
      "No Growth",
      "Nil",
      "Normal",
    ];
    for (const target of preferred) {
      const found = list.find((item) => item.toLowerCase() === target.toLowerCase());
      if (found) return found;
    }
    return undefined;
  }

  function normalizeNumericRange(field: SeedField) {
    if (field.fieldType !== FieldType.NUMBER) return field;
    let normalMin = field.normalMin;
    let normalMax = field.normalMax;
    const override = NUMERIC_RANGE_OVERRIDES[field.fieldKey];
    const preserveSingleBound = PRESERVE_SINGLE_BOUND_FIELD_KEYS.has(field.fieldKey);
    if (override) {
      normalMin = override.min;
      normalMax = override.max;
    } else if (!preserveSingleBound && normalMin !== undefined && normalMax === undefined) {
      normalMax = Math.max(normalMin, normalMin * 10);
    } else if (!preserveSingleBound && normalMax !== undefined && normalMin === undefined) {
      normalMin = 0;
    }
    return { ...field, normalMin, normalMax };
  }

  function withReferenceMetadata(testName: string, type: TestType, fields: SeedField[]): SeedField[] {
    const isRadiology = type === TestType.RADIOLOGY;
    const cultureTest = isCultureTest(testName);
    const qualitativeOnly = isQualitativeOnlyTest(testName);

    return fields.map((sourceField) => {
      let field = normalizeNumericRange(sourceField);

      if (isRadiology) {
        field = {
          ...field,
          normalMin: undefined,
          normalMax: undefined,
          normalText: undefined,
          referenceNote: undefined,
        };
      }

      const autoNormalText =
        field.fieldType === FieldType.DROPDOWN &&
        field.normalMin === undefined &&
        field.normalMax === undefined
          ? deriveNormalText(field.options)
          : undefined;

      const needsComplexNote =
        field.fieldType === FieldType.NUMBER &&
        (COMPLEX_REFERENCE_FIELDS.has(field.fieldKey) ||
          testName.toLowerCase().includes("hormone") ||
          testName.toLowerCase().includes("psa") ||
          testName.toLowerCase().includes("ferritin"));

      return {
        ...field,
        normalText: field.normalText ?? autoNormalText,
        referenceNote:
          field.referenceNote ??
          (needsComplexNote
            ? "Depends on age/sex and clinical context."
            : qualitativeOnly && field.fieldType === FieldType.NUMBER
            ? "Interpret with clinical context."
            : undefined),
        normalMin:
          cultureTest || (qualitativeOnly && field.fieldType !== FieldType.NUMBER)
            ? undefined
            : field.normalMin,
        normalMax:
          cultureTest || (qualitativeOnly && field.fieldType !== FieldType.NUMBER)
            ? undefined
            : field.normalMax,
      };
    });
  }

  function makeCultureFields() {
    return [
      { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Negative,Positive", normalText: "Negative", sortOrder: 1 },
      { label: "Organism", fieldKey: "organism", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
      { label: "Sensitivity", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    ] as SeedField[];
  }

  function makeRadiologyWorkflowFields() {
    return [
      { label: "Technique", fieldKey: "technique", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
      { label: "Findings", fieldKey: "findings", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
      { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
      { label: "Recommendation", fieldKey: "recommendation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    ];
  }

  function makeEcgWorkflowFields() {
    return [
      { label: "Heart Rate", fieldKey: "heartRate", fieldType: FieldType.TEXT, sortOrder: 1 },
      { label: "Rhythm", fieldKey: "rhythm", fieldType: FieldType.TEXT, sortOrder: 2 },
      { label: "Intervals", fieldKey: "intervals", fieldType: FieldType.TEXT, sortOrder: 3 },
      { label: "Axis", fieldKey: "axis", fieldType: FieldType.TEXT, sortOrder: 4 },
      { label: "Findings", fieldKey: "findings", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
      { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 6 },
    ];
  }

  function deriveRadiologyGrouping(testName: string) {
    const lower = testName.toLowerCase();
    if (!lower.includes("x-ray")) {
      return { groupKey: null, viewType: null, isDefaultInGroup: false };
    }

    let bodyPart = "";
    if (lower.startsWith("x-ray ")) {
      bodyPart = testName.slice("X-Ray ".length).split("(")[0].trim();
    } else {
      bodyPart = testName.split("X-Ray")[0].trim();
    }

    const groupKey = `${bodyPart
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}-xray`;

    const viewMatch = testName.match(/\(([^)]+)\)/);
    const rawView = viewMatch?.[1]?.trim() ?? "";
    const viewType = rawView.replace(/\bview\b/gi, "").trim() || null;

    const defaultViews = new Set(["AP", "PA", "Lateral"]);
    let isDefaultInGroup = viewType ? defaultViews.has(viewType) : false;

    if (groupKey === "chest-xray" && viewType === "AP") {
      isDefaultInGroup = false;
    }
    if (viewType === "Oblique" || viewType === "Mortise" || viewType === "Skyline") {
      isDefaultInGroup = false;
    }

    return { groupKey, viewType, isDefaultInGroup };
  }

  function canonicalizeRadiologyNameForDedup(input: string) {
    return normalizeName(input)
      .replace(/x[\s-]?ray/gi, "X-Ray")
      .replace(/\(\s*(AP|PA|Lateral|Oblique)\s+View\s*\)/gi, " $1")
      .replace(/\bLateral\b/gi, "LAT")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  async function syncExistingTestFieldsByName(params: {
    name: string;
    type: TestType;
    fields: SeedField[];
  }) {
    const targets = await prisma.diagnosticTest.findMany({
      where: { organizationId: orgId, name: params.name },
      select: { id: true },
    });
    if (targets.length === 0) return 0;

    const enriched = withReferenceMetadata(params.name, params.type, params.fields);
    for (const target of targets) {
      await replaceResultTemplateFields(
        target.id,
        mapTemplateFields(target.id, enriched),
        `syncExistingTestFieldsByName:${params.name}`
      );
    }
    return targets.length;
  }

  // -- LAB TESTS ----------------------------------------------------------------

  // 1. Full Blood Count ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â added Basophils field
  await seedTest({
    code: "FBC",
    name: "Full Blood Count",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-haematology",
    price: 3500,
    turnaroundMinutes: 120,
    sampleType: "EDTA Blood",
    description: "Complete blood count including WBC differential",
    fields: [
      {
        label: "Haemoglobin",
        fieldKey: "haemoglobin",
        fieldType: FieldType.NUMBER,
        unit: "g/dL",
        normalMin: 12,
        normalMax: 18,
        referenceNote: "Template style allows g/dL value with optional percent format, e.g. 12.6 g/dL (86%).",
        sortOrder: 1,
      },
      {
        label: "Haemoglobin (%)",
        fieldKey: "haemoglobin_percent",
        fieldType: FieldType.NUMBER,
        unit: "%",
        normalMin: 80,
        normalMax: 120,
        isRequired: false,
        sortOrder: 2,
      },
      { label: "PCV / Haematocrit", fieldKey: "pcv", fieldType: FieldType.NUMBER, unit: "%", normalMin: 35, normalMax: 53, sortOrder: 3 },
      { label: "WBC Count", fieldKey: "wbc", fieldType: FieldType.NUMBER, unit: "x10^9/L", normalMin: 4, normalMax: 11, sortOrder: 4 },
      { label: "Neutrophils", fieldKey: "neutrophils", fieldType: FieldType.NUMBER, unit: "%", normalMin: 40, normalMax: 75, sortOrder: 5 },
      { label: "Lymphocytes", fieldKey: "lymphocytes", fieldType: FieldType.NUMBER, unit: "%", normalMin: 20, normalMax: 45, sortOrder: 6 },
      { label: "Monocytes", fieldKey: "monocytes", fieldType: FieldType.NUMBER, unit: "%", normalMin: 2, normalMax: 10, sortOrder: 7 },
      { label: "Eosinophils", fieldKey: "eosinophils", fieldType: FieldType.NUMBER, unit: "%", normalMin: 1, normalMax: 6, sortOrder: 8 },
      { label: "Basophils", fieldKey: "basophils", fieldType: FieldType.NUMBER, unit: "%", normalMin: 0, normalMax: 1, sortOrder: 9 },
      { label: "Platelets", fieldKey: "platelets", fieldType: FieldType.NUMBER, unit: "x10^9/L", normalMin: 150, normalMax: 400, sortOrder: 10 },
      { label: "MCV", fieldKey: "mcv", fieldType: FieldType.NUMBER, unit: "fL", normalMin: 80, normalMax: 100, sortOrder: 11 },
      { label: "MCH", fieldKey: "mch", fieldType: FieldType.NUMBER, unit: "pg", normalMin: 27, normalMax: 33, sortOrder: 12 },
      { label: "MCHC", fieldKey: "mchc", fieldType: FieldType.NUMBER, unit: "g/dL", normalMin: 32, normalMax: 36, sortOrder: 13 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 14 },
    ],
  });

  // 2. Malaria Parasite
  await seedTest({
    code: "MP",
    name: "Malaria Parasite",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-micro",
    price: 1500,
    turnaroundMinutes: 60,
    sampleType: "EDTA Blood",
    description: "Thick and thin film for malaria parasite",
    fields: [
      { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
      { label: "Species", fieldKey: "species", fieldType: FieldType.DROPDOWN, options: "Plasmodium falciparum,Plasmodium vivax,Plasmodium malariae,Mixed,Not Applicable", isRequired: false, sortOrder: 2 },
      { label: "Parasitaemia", fieldKey: "parasitaemia", fieldType: FieldType.DROPDOWN, options: "+,++,+++,++++,Not Applicable", isRequired: false, sortOrder: 3 },
      { label: "Method", fieldKey: "method", fieldType: FieldType.DROPDOWN, options: "Thick Film,Thin Film,RDT", sortOrder: 4 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    ],
  });

  // 3. Urinalysis ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â added Ascorbic Acid and WBC/HPF fields
  await seedTest({
    code: "URA",
    name: "Urinalysis",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-urine",
    price: 1500,
    turnaroundMinutes: 60,
    sampleType: "Mid-stream Urine",
    fields: [
      { label: "Colour", fieldKey: "colour", fieldType: FieldType.DROPDOWN, options: "Pale Yellow,Yellow,Dark Yellow,Amber,Brown,Red,Colourless", sortOrder: 1 },
      { label: "Appearance", fieldKey: "appearance", fieldType: FieldType.DROPDOWN, options: "Clear,Slightly Turbid,Turbid,Very Turbid", sortOrder: 2 },
      { label: "pH", fieldKey: "ph", fieldType: FieldType.NUMBER, unit: "", normalMin: 4.5, normalMax: 8, sortOrder: 3 },
      { label: "Specific Gravity", fieldKey: "specific_gravity", fieldType: FieldType.TEXT, sortOrder: 4 },
      { label: "Protein", fieldKey: "protein", fieldType: FieldType.DROPDOWN, options: "Negative,Trace,+,++,+++", sortOrder: 5 },
      { label: "Glucose", fieldKey: "glucose", fieldType: FieldType.DROPDOWN, options: "Negative,Trace,+,++,+++", sortOrder: 6 },
      { label: "Ketones", fieldKey: "ketones", fieldType: FieldType.DROPDOWN, options: "Negative,Trace,+,++,+++", sortOrder: 7 },
      { label: "Blood", fieldKey: "blood", fieldType: FieldType.DROPDOWN, options: "Negative,Trace,+,++,+++", sortOrder: 8 },
      { label: "Bilirubin", fieldKey: "bilirubin", fieldType: FieldType.DROPDOWN, options: "Negative,+,++,+++", sortOrder: 9 },
      { label: "Urobilinogen", fieldKey: "urobilinogen", fieldType: FieldType.DROPDOWN, options: "Normal,Increased", sortOrder: 10 },
      { label: "Nitrite", fieldKey: "nitrite", fieldType: FieldType.DROPDOWN, options: "Negative,Positive", sortOrder: 11 },
      { label: "Leucocytes", fieldKey: "leucocytes", fieldType: FieldType.DROPDOWN, options: "Negative,Trace,+,++,+++", sortOrder: 12 },
      { label: "Ascorbic Acid", fieldKey: "ascorbic_acid", fieldType: FieldType.DROPDOWN, options: "Negative,Trace,+,++,+++", isRequired: false, sortOrder: 13 },
      { label: "WBC / HPF", fieldKey: "wbc_hpf", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 14 },
      { label: "Pus Cells (hpf)", fieldKey: "pus_cells", fieldType: FieldType.TEXT, sortOrder: 15 },
      { label: "RBCs (hpf)", fieldKey: "rbcs", fieldType: FieldType.TEXT, sortOrder: 16 },
      { label: "Epithelial Cells", fieldKey: "epithelial_cells", fieldType: FieldType.DROPDOWN, options: "Nil,Few,Moderate,Many", isRequired: false, sortOrder: 17 },
      { label: "Casts", fieldKey: "casts", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 18 },
      { label: "Calcium Oxalate Crystals", fieldKey: "calcium_oxalate", fieldType: FieldType.DROPDOWN, options: "Absent,Present", isRequired: false, sortOrder: 19 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 20 },
    ],
  });

  // 4. Fasting Blood Sugar
  await seedTest({
    code: "FBS",
    name: "Fasting Blood Sugar",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-chemistry",
    price: 1500,
    turnaroundMinutes: 60,
    sampleType: "Fluoride Oxalate Blood",
    fields: [
      {
        label: "Glucose Level (SI)",
        fieldKey: "glucose_mmol_l",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 4.2,
        normalMax: 6.1,
        referenceNote: "Equivalent conventional range: 76-110 mg/dL.",
        sortOrder: 1,
      },
      {
        label: "Glucose Level (Conventional)",
        fieldKey: "glucose_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 76,
        normalMax: 110,
        isRequired: false,
        referenceNote: "Equivalent SI range: 4.2-6.1 mmol/L.",
        sortOrder: 2,
      },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    ],
  });

  // 5. Random Blood Sugar
  await seedTest({
    code: "RBS",
    name: "Random Blood Sugar",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-chemistry",
    price: 1500,
    turnaroundMinutes: 30,
    sampleType: "Fluoride Oxalate Blood",
    fields: [
      {
        label: "Glucose Level (SI)",
        fieldKey: "glucose_mmol_l",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 4.1,
        normalMax: 7.2,
        referenceNote: "Equivalent conventional range: 74-131 mg/dL.",
        sortOrder: 1,
      },
      {
        label: "Glucose Level (Conventional)",
        fieldKey: "glucose_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 74,
        normalMax: 131,
        isRequired: false,
        referenceNote: "Equivalent SI range: 4.1-7.2 mmol/L.",
        sortOrder: 2,
      },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    ],
  });

  // 6. Widal Test
  await seedTest({
    code: "WIDAL",
    name: "Widal Test",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-serology",
    price: 2000,
    turnaroundMinutes: 90,
    sampleType: "Serum",
    fields: [
      { label: "S. Typhi O", fieldKey: "typhi_o", fieldType: FieldType.DROPDOWN, options: "Negative,1:20,1:40,1:80,1:160,1:320,1:640", sortOrder: 1 },
      { label: "S. Typhi H", fieldKey: "typhi_h", fieldType: FieldType.DROPDOWN, options: "Negative,1:20,1:40,1:80,1:160,1:320,1:640", sortOrder: 2 },
      { label: "S. Paratyphi A (O)", fieldKey: "paratyphi_ao", fieldType: FieldType.DROPDOWN, options: "Negative,1:20,1:40,1:80,1:160,1:320", sortOrder: 3 },
      { label: "S. Paratyphi A (H)", fieldKey: "paratyphi_ah", fieldType: FieldType.DROPDOWN, options: "Negative,1:20,1:40,1:80,1:160,1:320", sortOrder: 4 },
      { label: "S. Paratyphi B (O)", fieldKey: "paratyphi_bo", fieldType: FieldType.DROPDOWN, options: "Negative,1:20,1:40,1:80,1:160,1:320", isRequired: false, sortOrder: 5 },
      { label: "S. Paratyphi B (H)", fieldKey: "paratyphi_bh", fieldType: FieldType.DROPDOWN, options: "Negative,1:20,1:40,1:80,1:160,1:320", sortOrder: 6 },
      { label: "S. Paratyphi C (O)", fieldKey: "paratyphi_co", fieldType: FieldType.DROPDOWN, options: "Negative,1:20,1:40,1:80,1:160,1:320", isRequired: false, sortOrder: 7 },
      { label: "S. Paratyphi C (H)", fieldKey: "paratyphi_ch", fieldType: FieldType.DROPDOWN, options: "Negative,1:20,1:40,1:80,1:160,1:320", isRequired: false, sortOrder: 8 },
      { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, sortOrder: 9 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 10 },
    ],
  });

  // 7. Liver Function Test
  await seedTest({
    code: "LFT",
    name: "Liver Function Test",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-chemistry",
    price: 5000,
    turnaroundMinutes: 180,
    sampleType: "Serum",
    fields: HOLY_SOULS_LFT_FIELDS,
  });

  // 8. Kidney Function Test
  await seedTest({
    code: "KFT",
    name: "Kidney Function Test",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-chemistry",
    price: 5000,
    turnaroundMinutes: 180,
    sampleType: "Serum",
    fields: HOLY_SOULS_KFT_FIELDS,
  });
  // 9. HBsAg
  await seedTest({
    code: "HBSAG",
    name: "Hepatitis B Surface Antigen (HBsAg)",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-serology",
    price: 2500,
    turnaroundMinutes: 60,
    sampleType: "Serum",
    fields: [
      { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
      { label: "Method", fieldKey: "method", fieldType: FieldType.DROPDOWN, options: "Rapid Strip,ELISA", sortOrder: 2 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    ],
  });

  // 10. HIV Screening
  await seedTest({
    code: "HIV",
    name: "HIV Screening",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-serology",
    price: 2000,
    turnaroundMinutes: 60,
    sampleType: "Serum / Whole Blood",
    fields: [
      { label: "Determine Result", fieldKey: "determine", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
      { label: "Unigold Result", fieldKey: "unigold", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive,Not Done", sortOrder: 2 },
      { label: "Final Interpretation", fieldKey: "interpretation", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 3 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    ],
  });

  // 11. Stool Analysis - standard template with plus-scale findings
  await seedTest({
    code: "STOOL",
    name: "Stool Analysis",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-micro",
    price: 1500,
    turnaroundMinutes: 90,
    sampleType: "Stool",
    fields: HOLY_SOULS_STOOL_ANALYSIS_FIELDS,
  });

  // 12. Faecal Occult Blood (FOB) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â standalone test from docx
  await seedTest({
    code: "FOB",
    name: "Faecal Occult Blood (FOB)",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-micro",
    price: 1500,
    turnaroundMinutes: 60,
    sampleType: "Stool",
    description: "Test for hidden blood in stool",
    fields: [
      { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
      { label: "Method", fieldKey: "method", fieldType: FieldType.DROPDOWN, options: "Rapid Immunoassay,Guaiac-based", isRequired: false, sortOrder: 2 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    ],
  });

  // 13. Sickling Test
  await seedTest({
    code: "SICK",
    name: "Sickling Test",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-haematology",
    price: 1000,
    turnaroundMinutes: 60,
    sampleType: "EDTA Blood",
    description: "Screening test for sickle cell trait or disease",
    fields: [
      { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    ],
  });

  // 14. G6PD Screening
  await seedTest({
    code: "G6PD",
    name: "G6PD Screening",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-haematology",
    price: 2500,
    turnaroundMinutes: 120,
    sampleType: "EDTA Blood",
    description: "Glucose-6-phosphate dehydrogenase deficiency screening",
    fields: [
      { label: "G6PD Activity", fieldKey: "g6pd_activity", fieldType: FieldType.NUMBER, unit: "U/g Hb", normalMin: 6.9, normalMax: 20.0, isRequired: false, sortOrder: 1 },
      { label: "Qualitative Result", fieldKey: "qualitative_result", fieldType: FieldType.DROPDOWN, options: "Normal,Deficient,Severely Deficient", sortOrder: 2 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    ],
  });

  // 15. Bleeding Time & Clotting Time
  await seedTest({
    code: "BTCT",
    name: "Bleeding Time & Clotting Time",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-haematology",
    price: 1500,
    turnaroundMinutes: 60,
    sampleType: "Whole Blood",
    description: "Primary haemostasis screening tests",
    fields: [
      { label: "Bleeding Time", fieldKey: "bleeding_time", fieldType: FieldType.TEXT, sortOrder: 1 },
      { label: "Clotting Time", fieldKey: "clotting_time", fieldType: FieldType.TEXT, sortOrder: 2 },
      { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    ],
  });

  // 16. Typhoid IgM / IgG Rapid Test
  await seedTest({
    code: "TYPHRDT",
    name: "Typhoid IgM/IgG Rapid Test",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-serology",
    price: 2000,
    turnaroundMinutes: 60,
    sampleType: "Whole Blood / Serum",
    description: "Rapid immunochromatographic test for Salmonella typhi antibodies",
    fields: [
      { label: "IgM Result", fieldKey: "igm_result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
      { label: "IgG Result", fieldKey: "igg_result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 2 },
      { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    ],
  });

  // 17. Dengue NS1 Antigen
  await seedTest({
    code: "DENGNS1",
    name: "Dengue NS1 Antigen",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-serology",
    price: 3500,
    turnaroundMinutes: 90,
    sampleType: "Serum",
    description: "Dengue virus non-structural protein 1 antigen rapid test",
    fields: [
      { label: "NS1 Antigen", fieldKey: "ns1_antigen", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
      { label: "Dengue IgM", fieldKey: "dengue_igm", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Not Done", isRequired: false, sortOrder: 2 },
      { label: "Dengue IgG", fieldKey: "dengue_igg", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Not Done", isRequired: false, sortOrder: 3 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    ],
  });

  // 18. H. Pylori Antibody (Serum)
  await seedTest({
    code: "HPYLS",
    name: "H. Pylori Antibody (Serum)",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-serology",
    price: 2000,
    turnaroundMinutes: 60,
    sampleType: "Serum",
    description: "Serum screened for H. pylori antibodies",
    fields: [
      { label: "H. Pylori IgG Result", fieldKey: "hpylori_igg", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 1 },
      { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    ],
  });

  // 19. H. Pylori Antigen (Stool)
  await seedTest({
    code: "HPYLST",
    name: "H. Pylori Antigen (Stool)",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-serology",
    price: 2500,
    turnaroundMinutes: 60,
    sampleType: "Stool",
    description: "Stool screened for H. pylori antigens",
    fields: [
      { label: "H. Pylori Antigen Result", fieldKey: "hpylori_antigen", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 1 },
      { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    ],
  });

  // 20. Leptospira Screening
  await seedTest({
    code: "LEPTO",
    name: "Leptospira Screening",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-serology",
    price: 3000,
    turnaroundMinutes: 120,
    sampleType: "Serum",
    description: "Screening for Leptospira antibodies",
    fields: [
      { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 1 },
      { label: "Titre", fieldKey: "titre", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
      { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 3 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    ],
  });

  // 21. Oral Glucose Tolerance Test (OGTT)
  await seedTest({
    code: "OGTT",
    name: "Oral Glucose Tolerance Test (OGTT)",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-chemistry",
    price: 3500,
    turnaroundMinutes: 240,
    sampleType: "Serum (Fluoride Oxalate)",
    description: "75g oral glucose load with serial glucose measurements for diabetes and gestational diabetes diagnosis",
    fields: [
      {
        label: "Fasting Glucose",
        fieldKey: "glucose_fasting",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 3.9,
        normalMax: 5.6,
        referenceNote: "Normal: <5.6 mmol/L; Impaired Fasting Glucose: 5.6-6.9 mmol/L; Diabetes: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥7.0 mmol/L",
        sortOrder: 1,
      },
      {
        label: "Fasting Glucose (Conventional)",
        fieldKey: "glucose_fasting_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 70,
        normalMax: 100,
        isRequired: false,
        referenceNote: "Normal: <100 mg/dL; Impaired Fasting Glucose: 100-125 mg/dL; Diabetes: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥126 mg/dL",
        sortOrder: 2,
      },
      {
        label: "1 Hour Glucose",
        fieldKey: "glucose_1hr",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 3.9,
        normalMax: 8.9,
        referenceNote: "Normal: <8.9 mmol/L; Impaired: 8.9-11.0 mmol/L; Diabetes: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥11.1 mmol/L",
        sortOrder: 3,
      },
      {
        label: "1 Hour Glucose (Conventional)",
        fieldKey: "glucose_1hr_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 70,
        normalMax: 160,
        isRequired: false,
        referenceNote: "Normal: <160 mg/dL; Impaired: 160-199 mg/dL; Diabetes: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥200 mg/dL",
        sortOrder: 4,
      },
      {
        label: "2 Hour Glucose",
        fieldKey: "glucose_2hr",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 3.9,
        normalMax: 7.8,
        referenceNote: "Normal: <7.8 mmol/L; Impaired Glucose Tolerance: 7.8-11.0 mmol/L; Diabetes: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥11.1 mmol/L",
        sortOrder: 5,
      },
      {
        label: "2 Hour Glucose (Conventional)",
        fieldKey: "glucose_2hr_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 70,
        normalMax: 140,
        isRequired: false,
        referenceNote: "Normal: <140 mg/dL; Impaired Glucose Tolerance: 140-199 mg/dL; Diabetes: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥200 mg/dL",
        sortOrder: 6,
      },
      {
        label: "3 Hour Glucose",
        fieldKey: "glucose_3hr",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 3.9,
        normalMax: 7.8,
        isRequired: false,
        referenceNote: "Should return to near-fasting levels by 3 hours",
        sortOrder: 7,
      },
      {
        label: "3 Hour Glucose (Conventional)",
        fieldKey: "glucose_3hr_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 70,
        normalMax: 140,
        isRequired: false,
        sortOrder: 8,
      },
      {
        label: "Glucose Load",
        fieldKey: "glucose_load",
        fieldType: FieldType.DROPDOWN,
        options: "75g,100g (Pregnancy)",
        isRequired: false,
        sortOrder: 9,
      },
      {
        label: "Indication",
        fieldKey: "indication",
        fieldType: FieldType.DROPDOWN,
        options: "Diabetes Screening,Gestational Diabetes Screening,Pre-diabetes Evaluation,PCOS Evaluation,Routine Check-up",
        isRequired: false,
        sortOrder: 10,
      },
      {
        label: "Interpretation",
        fieldKey: "interpretation",
        fieldType: FieldType.DROPDOWN,
        options: "Normal,Impaired Fasting Glucose,Impaired Glucose Tolerance,Diabetes Mellitus,Gestational Diabetes Mellitus",
        isRequired: false,
        sortOrder: 11,
      },
      {
        label: "Clinical Notes",
        fieldKey: "clinical_notes",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
        sortOrder: 12,
      },
      {
        label: "Comments",
        fieldKey: "comments",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
        sortOrder: 13,
      },
    ],
  });

  // 22. Gestational OGTT (100g - 4 specimen)
  await seedTest({
    code: "GOGTT",
    name: "Gestational OGTT (100g)",
    type: TestType.LAB,
    department: Department.LABORATORY,
    categoryId: "cat-chemistry",
    price: 4500,
    turnaroundMinutes: 240,
    sampleType: "Serum (Fluoride Oxalate)",
    description: "100g oral glucose load with 4 specimens for gestational diabetes diagnosis (Carpenter-Coustan criteria)",
    fields: [
      {
        label: "Fasting Glucose",
        fieldKey: "glucose_fasting",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 3.3,
        normalMax: 5.3,
        referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥5.3 mmol/L (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥95 mg/dL)",
        sortOrder: 1,
      },
      {
        label: "Fasting Glucose (Conventional)",
        fieldKey: "glucose_fasting_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 59,
        normalMax: 95,
        isRequired: false,
        referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥95 mg/dL (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥5.3 mmol/L)",
        sortOrder: 2,
      },
      {
        label: "1 Hour Glucose",
        fieldKey: "glucose_1hr",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 3.3,
        normalMax: 10.0,
        referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥10.0 mmol/L (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥180 mg/dL)",
        sortOrder: 3,
      },
      {
        label: "1 Hour Glucose (Conventional)",
        fieldKey: "glucose_1hr_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 59,
        normalMax: 180,
        isRequired: false,
        referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥180 mg/dL (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥10.0 mmol/L)",
        sortOrder: 4,
      },
      {
        label: "2 Hour Glucose",
        fieldKey: "glucose_2hr",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 3.3,
        normalMax: 8.6,
        referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥8.6 mmol/L (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥155 mg/dL)",
        sortOrder: 5,
      },
      {
        label: "2 Hour Glucose (Conventional)",
        fieldKey: "glucose_2hr_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 59,
        normalMax: 155,
        isRequired: false,
        referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥155 mg/dL (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥8.6 mmol/L)",
        sortOrder: 6,
      },
      {
        label: "3 Hour Glucose",
        fieldKey: "glucose_3hr",
        fieldType: FieldType.NUMBER,
        unit: "mmol/L",
        normalMin: 3.3,
        normalMax: 7.8,
        referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥7.8 mmol/L (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥140 mg/dL)",
        sortOrder: 7,
      },
      {
        label: "3 Hour Glucose (Conventional)",
        fieldKey: "glucose_3hr_mg_dl",
        fieldType: FieldType.NUMBER,
        unit: "mg/dL",
        normalMin: 59,
        normalMax: 140,
        isRequired: false,
        referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥140 mg/dL (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥7.8 mmol/L)",
        sortOrder: 8,
      },
      {
        label: "Gestational Age",
        fieldKey: "gestational_age",
        fieldType: FieldType.TEXT,
        unit: "weeks",
        isRequired: false,
        sortOrder: 9,
      },
      {
        label: "GDM Diagnosis",
        fieldKey: "gdm_diagnosis",
        fieldType: FieldType.DROPDOWN,
        options: "Not Diagnosed,Diagnosed (2 or more values abnormal),Diagnosed (1 value abnormal per some guidelines)",
        isRequired: false,
        sortOrder: 10,
      },
      {
        label: "Interpretation Notes",
        fieldKey: "interpretation",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
        sortOrder: 11,
      },
      {
        label: "Comments",
        fieldKey: "comments",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
        sortOrder: 12,
      },
    ],
  });

  // -- RADIOLOGY TESTS ----------------------------------------------------------
  const organizationsForRadiologyReset = await prisma.organization.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  let deletedRadiologyCount = 0;
  let deactivatedReferencedRadiologyCount = 0;

  for (const targetOrg of organizationsForRadiologyReset) {
    const deactivated = await runWithRetry(`radiology-reset-deactivate:${targetOrg.id}`, () =>
      prisma.diagnosticTest.updateMany({
        where: {
          organizationId: targetOrg.id,
          categoryId: "cat-imaging",
          testOrders: { some: {} },
        },
        data: { isActive: false },
      })
    );
    deactivatedReferencedRadiologyCount += deactivated.count;

    while (true) {
      const deletable = await runWithRetry(`radiology-reset-find-deletable:${targetOrg.id}`, () =>
        prisma.diagnosticTest.findMany({
          where: {
            organizationId: targetOrg.id,
            categoryId: "cat-imaging",
            testOrders: { none: {} },
          },
          select: { id: true },
          take: RADIOLOGY_DELETE_CHUNK_SIZE,
        })
      );

      if (deletable.length === 0) break;

      const ids = deletable.map((row) => row.id);
      const deleted = await runWithRetry(`radiology-reset-delete:${targetOrg.id}`, () =>
        prisma.diagnosticTest.deleteMany({
          where: { id: { in: ids } },
        })
      );
      deletedRadiologyCount += deleted.count;
    }
  }

  console.log(
    `Radiology reset: deleted ${deletedRadiologyCount} unreferenced tests and deactivated ${deactivatedReferencedRadiologyCount} referenced tests`
  );

  const radiologyTests: Array<{ code: string; name: string }> = [
    { code: "CXR-PA", name: "Chest X-Ray (PA)" },
    { code: "CXR-AP", name: "Chest X-Ray (AP)" },
    { code: "CXR-DEC", name: "Chest X-Ray (Decubitus)" },
    { code: "CXR-LORD", name: "Chest X-Ray (Apical Lordotic)" },
    { code: "SKL-APL", name: "Skull X-Ray (AP & LAT)" },
    { code: "PNS-WAT", name: "PNS X-Ray (Waters View)" },
    { code: "PNS-CAL", name: "PNS X-Ray (Caldwell View)" },
    { code: "SKL-SMV", name: "Skull X-Ray (SMV View)" },
    { code: "NAS", name: "Nasal Bones X-Ray" },
    { code: "FAC", name: "Facial Bones X-Ray" },
    { code: "CSP-APL", name: "Cervical Spine X-Ray (AP & LAT)" },
    { code: "TSP-APL", name: "Thoracic Spine X-Ray (AP & LAT)" },
    { code: "LSP-APL", name: "Lumbosacral Spine X-Ray (AP & LAT)" },
    { code: "SAC", name: "Sacrum & Coccyx X-Ray" },
    { code: "SHJ-APL", name: "Shoulder X-Ray (AP & LAT)" },
    { code: "CLA-APL", name: "Clavicle X-Ray (AP & LAT)" },
    { code: "SCA-APL", name: "Scapula X-Ray (AP & LAT)" },
    { code: "ACJ", name: "Acromioclavicular Joint X-Ray" },
    { code: "HUM-APL", name: "Humerus X-Ray (AP & LAT)" },
    { code: "ELB-APL", name: "Elbow X-Ray (AP & LAT)" },
    { code: "FAR-APL", name: "Forearm X-Ray (AP & LAT)" },
    { code: "WRI-APL", name: "Wrist X-Ray (AP & LAT)" },
    { code: "HAN-APL", name: "Hand X-Ray (AP & LAT)" },
    { code: "DIG-APL", name: "Fingers X-Ray (AP & LAT)" },
    { code: "PEL-AP", name: "Pelvis X-Ray (AP)" },
    { code: "HIP-APL", name: "Hip X-Ray (AP & LAT)" },
    { code: "FEM-APL", name: "Femur X-Ray (AP & LAT)" },
    { code: "LEG-APL", name: "Leg X-Ray (AP & LAT)" },
    { code: "KNE-APL", name: "Knee X-Ray (AP & LAT)" },
    { code: "TIB-APL", name: "Tibia & Fibula X-Ray (AP & LAT)" },
    { code: "ANK-APL", name: "Ankle X-Ray (AP & LAT)" },
    { code: "FOO-APL", name: "Foot X-Ray (AP & LAT)" },
    { code: "TOE-APL", name: "Toes X-Ray (AP & LAT)" },
    { code: "CAL", name: "Calcaneus X-Ray" },
    { code: "ABD-ER", name: "Abdomen X-Ray (Erect)" },
    { code: "ABD-SU", name: "Abdomen X-Ray (Supine)" },
    { code: "KUB", name: "KUB X-Ray" },
    { code: "BAS", name: "Barium Swallow" },
    { code: "BAM", name: "Barium Meal" },
    { code: "BAF", name: "Barium Follow-Through" },
    { code: "BAE", name: "Barium Enema" },
    { code: "IVU", name: "Intravenous Urography (IVU)" },
    { code: "HSG", name: "Hysterosalpingography (HSG)" },
    { code: "MCU", name: "Micturating Cystourethrogram (MCU)" },
    { code: "SKS", name: "Skeletal Survey" },
    { code: "BBG", name: "Babygram" },
    { code: "STN", name: "Soft Tissue Neck X-Ray" },
    { code: "FBL", name: "Foreign Body Localization" },
    { code: "BAG", name: "Bone Age X-Ray" },
    { code: "STR", name: "Stress View X-Ray" },
    { code: "USS-ABD", name: "Abdominal Ultrasound" },
    { code: "USS-PEL", name: "Pelvic Ultrasound" },
    { code: "USS-ABP", name: "Abdominopelvic Ultrasound" },
    { code: "USS-OBS", name: "Obstetric Ultrasound" },
    { code: "USS-BRS", name: "Breast Ultrasound" },
    { code: "USS-THY", name: "Thyroid Ultrasound" },
    { code: "USS-SC", name: "Scrotal Ultrasound" },
    { code: "USS-PR", name: "Prostate Ultrasound" },
    { code: "USS-REN", name: "Renal Ultrasound" },
    { code: "USS-DOP", name: "Doppler Ultrasound" },
    { code: "CT-BR", name: "CT Brain" },
    { code: "CT-CH", name: "CT Chest" },
    { code: "CT-ABD", name: "CT Abdomen" },
    { code: "CT-PEL", name: "CT Pelvis" },
    { code: "CT-SP", name: "CT Spine" },
    { code: "CT-ANG", name: "CT Angiography" },
    { code: "MRI-BR", name: "MRI Brain" },
    { code: "MRI-SP", name: "MRI Spine" },
    { code: "MRI-ABD", name: "MRI Abdomen" },
    { code: "MRI-PEL", name: "MRI Pelvis" },
  ];

  for (const test of radiologyTests) {
    const grouping = deriveRadiologyGrouping(test.name);
    await seedTest({
      code: test.code,
      name: test.name,
      type: TestType.RADIOLOGY,
      department: Department.RADIOLOGY,
      categoryId: "cat-imaging",
      price: 7000,
      turnaroundMinutes: 60,
      description: "Standardized radiology catalog test",
      groupKey: grouping.groupKey,
      viewType: grouping.viewType,
      isDefaultInGroup: grouping.isDefaultInGroup,
      fields: makeRadiologyWorkflowFields(),
    });
  }

  const missingRadiologyTests: Array<{ code: string; name: string }> = [
    { code: "CXR-PAL", name: "Chest X-Ray (AP & LAT)" },
    { code: "CXR-LAT", name: "Chest X-Ray (Lateral)" },
    { code: "CXR-SUP", name: "Chest X-Ray (AP Supine)" },
    { code: "CXR-ERT", name: "Chest X-Ray (AP Erect)" },
    { code: "CXR-EXP", name: "Chest X-Ray (Expiratory View)" },
    { code: "ORB", name: "Orbital X-Ray" },
    { code: "SKL-LAT", name: "Skull X-Ray (Lateral)" },
    { code: "SKL-TWN", name: "Skull X-Ray (Towne View)" },
    { code: "COB", name: "Scoliosis X-Ray (Full Spine)" },
    { code: "SHS", name: "Shoulder Stress View X-Ray" },
    { code: "PEL-LAT", name: "Pelvis X-Ray (Lateral)" },
    { code: "PEL-APL", name: "Pelvis X-Ray (AP & LAT)" },
    { code: "PEL-INL", name: "Pelvis X-Ray (Inlet View)" },
    { code: "PEL-OUT", name: "Pelvis X-Ray (Outlet View)" },
    { code: "SIJ-APL", name: "Sacroiliac Joint X-Ray (AP & Oblique)" },
    { code: "HIP-XTL", name: "Hip X-Ray (Cross-Table Lateral)" },
    { code: "KNE-SKY", name: "Knee X-Ray (Skyline View)" },
    { code: "KNE-TUN", name: "Knee X-Ray (Tunnel View)" },
    { code: "ANK-MOR", name: "Ankle X-Ray (Mortise View)" },
    { code: "FOO-OBL", name: "Foot X-Ray (Oblique)" },
    { code: "TOE-OBL", name: "Toes X-Ray (Oblique)" },
    { code: "SHO-R-APL", name: "Right Shoulder X-Ray (AP & LAT)" },
    { code: "SHO-R-PA", name: "Right Shoulder X-Ray (PA)" },
    { code: "SHO-R-LAT", name: "Right Shoulder X-Ray (Lateral)" },
    { code: "SHO-R-AP", name: "Right Shoulder X-Ray (AP)" },
    { code: "SHO-L-APL", name: "Left Shoulder X-Ray (AP & LAT)" },
    { code: "SHO-L-PA", name: "Left Shoulder X-Ray (PA)" },
    { code: "SHO-L-LAT", name: "Left Shoulder X-Ray (Lateral)" },
    { code: "SHO-L-AP", name: "Left Shoulder X-Ray (AP)" },
    { code: "CLA-R-APL", name: "Right Clavicle X-Ray (AP & LAT)" },
    { code: "CLA-R-PA", name: "Right Clavicle X-Ray (PA)" },
    { code: "CLA-R-LAT", name: "Right Clavicle X-Ray (Lateral)" },
    { code: "CLA-R-AP", name: "Right Clavicle X-Ray (AP)" },
    { code: "CLA-L-APL", name: "Left Clavicle X-Ray (AP & LAT)" },
    { code: "CLA-L-PA", name: "Left Clavicle X-Ray (PA)" },
    { code: "CLA-L-LAT", name: "Left Clavicle X-Ray (Lateral)" },
    { code: "CLA-L-AP", name: "Left Clavicle X-Ray (AP)" },
    { code: "SCA-R-APL", name: "Right Scapula X-Ray (AP & LAT)" },
    { code: "SCA-R-PA", name: "Right Scapula X-Ray (PA)" },
    { code: "SCA-R-LAT", name: "Right Scapula X-Ray (Lateral)" },
    { code: "SCA-R-AP", name: "Right Scapula X-Ray (AP)" },
    { code: "SCA-L-APL", name: "Left Scapula X-Ray (AP & LAT)" },
    { code: "SCA-L-PA", name: "Left Scapula X-Ray (PA)" },
    { code: "SCA-L-LAT", name: "Left Scapula X-Ray (Lateral)" },
    { code: "SCA-L-AP", name: "Left Scapula X-Ray (AP)" },
    { code: "HUM-R-APL", name: "Right Humerus X-Ray (AP & LAT)" },
    { code: "HUM-R-PA", name: "Right Humerus X-Ray (PA)" },
    { code: "HUM-R-LAT", name: "Right Humerus X-Ray (Lateral)" },
    { code: "HUM-R-AP", name: "Right Humerus X-Ray (AP)" },
    { code: "HUM-L-APL", name: "Left Humerus X-Ray (AP & LAT)" },
    { code: "HUM-L-PA", name: "Left Humerus X-Ray (PA)" },
    { code: "HUM-L-LAT", name: "Left Humerus X-Ray (Lateral)" },
    { code: "HUM-L-AP", name: "Left Humerus X-Ray (AP)" },
    { code: "ELB-R-APL", name: "Right Elbow X-Ray (AP & LAT)" },
    { code: "ELB-R-PA", name: "Right Elbow X-Ray (PA)" },
    { code: "ELB-R-LAT", name: "Right Elbow X-Ray (Lateral)" },
    { code: "ELB-R-AP", name: "Right Elbow X-Ray (AP)" },
    { code: "ELB-L-APL", name: "Left Elbow X-Ray (AP & LAT)" },
    { code: "ELB-L-PA", name: "Left Elbow X-Ray (PA)" },
    { code: "ELB-L-LAT", name: "Left Elbow X-Ray (Lateral)" },
    { code: "ELB-L-AP", name: "Left Elbow X-Ray (AP)" },
    { code: "FAR-R-APL", name: "Right Forearm X-Ray (AP & LAT)" },
    { code: "FAR-R-PA", name: "Right Forearm X-Ray (PA)" },
    { code: "FAR-R-LAT", name: "Right Forearm X-Ray (Lateral)" },
    { code: "FAR-R-AP", name: "Right Forearm X-Ray (AP)" },
    { code: "FAR-L-APL", name: "Left Forearm X-Ray (AP & LAT)" },
    { code: "FAR-L-PA", name: "Left Forearm X-Ray (PA)" },
    { code: "FAR-L-LAT", name: "Left Forearm X-Ray (Lateral)" },
    { code: "FAR-L-AP", name: "Left Forearm X-Ray (AP)" },
    { code: "WRI-R-APL", name: "Right Wrist X-Ray (AP & LAT)" },
    { code: "WRI-R-PA", name: "Right Wrist X-Ray (PA)" },
    { code: "WRI-R-LAT", name: "Right Wrist X-Ray (Lateral)" },
    { code: "WRI-R-AP", name: "Right Wrist X-Ray (AP)" },
    { code: "WRI-L-APL", name: "Left Wrist X-Ray (AP & LAT)" },
    { code: "WRI-L-PA", name: "Left Wrist X-Ray (PA)" },
    { code: "WRI-L-LAT", name: "Left Wrist X-Ray (Lateral)" },
    { code: "WRI-L-AP", name: "Left Wrist X-Ray (AP)" },
    { code: "HAN-R-APL", name: "Right Hand X-Ray (AP & LAT)" },
    { code: "HAN-R-PA", name: "Right Hand X-Ray (PA)" },
    { code: "HAN-R-LAT", name: "Right Hand X-Ray (Lateral)" },
    { code: "HAN-R-AP", name: "Right Hand X-Ray (AP)" },
    { code: "HAN-L-APL", name: "Left Hand X-Ray (AP & LAT)" },
    { code: "HAN-L-PA", name: "Left Hand X-Ray (PA)" },
    { code: "HAN-L-LAT", name: "Left Hand X-Ray (Lateral)" },
    { code: "HAN-L-AP", name: "Left Hand X-Ray (AP)" },
    { code: "DIG-R-APL", name: "Right Fingers X-Ray (AP & LAT)" },
    { code: "DIG-R-PA", name: "Right Fingers X-Ray (PA)" },
    { code: "DIG-R-LAT", name: "Right Fingers X-Ray (Lateral)" },
    { code: "DIG-R-AP", name: "Right Fingers X-Ray (AP)" },
    { code: "DIG-L-APL", name: "Left Fingers X-Ray (AP & LAT)" },
    { code: "DIG-L-PA", name: "Left Fingers X-Ray (PA)" },
    { code: "DIG-L-LAT", name: "Left Fingers X-Ray (Lateral)" },
    { code: "DIG-L-AP", name: "Left Fingers X-Ray (AP)" },
    { code: "HIP-R-APL", name: "Right Hip X-Ray (AP & LAT)" },
    { code: "HIP-R-PA", name: "Right Hip X-Ray (PA)" },
    { code: "HIP-R-LAT", name: "Right Hip X-Ray (Lateral)" },
    { code: "HIP-R-AP", name: "Right Hip X-Ray (AP)" },
    { code: "HIP-L-APL", name: "Left Hip X-Ray (AP & LAT)" },
    { code: "HIP-L-PA", name: "Left Hip X-Ray (PA)" },
    { code: "HIP-L-LAT", name: "Left Hip X-Ray (Lateral)" },
    { code: "HIP-L-AP", name: "Left Hip X-Ray (AP)" },
    { code: "FEM-R-APL", name: "Right Femur X-Ray (AP & LAT)" },
    { code: "FEM-R-PA", name: "Right Femur X-Ray (PA)" },
    { code: "FEM-R-LAT", name: "Right Femur X-Ray (Lateral)" },
    { code: "FEM-R-AP", name: "Right Femur X-Ray (AP)" },
    { code: "FEM-L-APL", name: "Left Femur X-Ray (AP & LAT)" },
    { code: "FEM-L-PA", name: "Left Femur X-Ray (PA)" },
    { code: "FEM-L-LAT", name: "Left Femur X-Ray (Lateral)" },
    { code: "FEM-L-AP", name: "Left Femur X-Ray (AP)" },
    { code: "LEG-R-APL", name: "Right Leg X-Ray (AP & LAT)" },
    { code: "LEG-R-PA", name: "Right Leg X-Ray (PA)" },
    { code: "LEG-R-LAT", name: "Right Leg X-Ray (Lateral)" },
    { code: "LEG-R-AP", name: "Right Leg X-Ray (AP)" },
    { code: "LEG-L-APL", name: "Left Leg X-Ray (AP & LAT)" },
    { code: "LEG-L-PA", name: "Left Leg X-Ray (PA)" },
    { code: "LEG-L-LAT", name: "Left Leg X-Ray (Lateral)" },
    { code: "LEG-L-AP", name: "Left Leg X-Ray (AP)" },
    { code: "KNE-R-APL", name: "Right Knee X-Ray (AP & LAT)" },
    { code: "KNE-R-PA", name: "Right Knee X-Ray (PA)" },
    { code: "KNE-R-LAT", name: "Right Knee X-Ray (Lateral)" },
    { code: "KNE-R-AP", name: "Right Knee X-Ray (AP)" },
    { code: "KNE-L-APL", name: "Left Knee X-Ray (AP & LAT)" },
    { code: "KNE-L-PA", name: "Left Knee X-Ray (PA)" },
    { code: "KNE-L-LAT", name: "Left Knee X-Ray (Lateral)" },
    { code: "KNE-L-AP", name: "Left Knee X-Ray (AP)" },
    { code: "TIB-R-APL", name: "Right Tibia & Fibula X-Ray (AP & LAT)" },
    { code: "TIB-R-PA", name: "Right Tibia & Fibula X-Ray (PA)" },
    { code: "TIB-R-LAT", name: "Right Tibia & Fibula X-Ray (Lateral)" },
    { code: "TIB-R-AP", name: "Right Tibia & Fibula X-Ray (AP)" },
    { code: "TIB-L-APL", name: "Left Tibia & Fibula X-Ray (AP & LAT)" },
    { code: "TIB-L-PA", name: "Left Tibia & Fibula X-Ray (PA)" },
    { code: "TIB-L-LAT", name: "Left Tibia & Fibula X-Ray (Lateral)" },
    { code: "TIB-L-AP", name: "Left Tibia & Fibula X-Ray (AP)" },
    { code: "ANK-R-APL", name: "Right Ankle X-Ray (AP & LAT)" },
    { code: "ANK-R-PA", name: "Right Ankle X-Ray (PA)" },
    { code: "ANK-R-LAT", name: "Right Ankle X-Ray (Lateral)" },
    { code: "ANK-R-AP", name: "Right Ankle X-Ray (AP)" },
    { code: "ANK-L-APL", name: "Left Ankle X-Ray (AP & LAT)" },
    { code: "ANK-L-PA", name: "Left Ankle X-Ray (PA)" },
    { code: "ANK-L-LAT", name: "Left Ankle X-Ray (Lateral)" },
    { code: "ANK-L-AP", name: "Left Ankle X-Ray (AP)" },
    { code: "FOO-R-APL", name: "Right Foot X-Ray (AP & LAT)" },
    { code: "FOO-R-PA", name: "Right Foot X-Ray (PA)" },
    { code: "FOO-R-LAT", name: "Right Foot X-Ray (Lateral)" },
    { code: "FOO-R-AP", name: "Right Foot X-Ray (AP)" },
    { code: "FOO-L-APL", name: "Left Foot X-Ray (AP & LAT)" },
    { code: "FOO-L-PA", name: "Left Foot X-Ray (PA)" },
    { code: "FOO-L-LAT", name: "Left Foot X-Ray (Lateral)" },
    { code: "FOO-L-AP", name: "Left Foot X-Ray (AP)" },
    { code: "TOE-R-APL", name: "Right Toes X-Ray (AP & LAT)" },
    { code: "TOE-R-PA", name: "Right Toes X-Ray (PA)" },
    { code: "TOE-R-LAT", name: "Right Toes X-Ray (Lateral)" },
    { code: "TOE-R-AP", name: "Right Toes X-Ray (AP)" },
    { code: "TOE-L-APL", name: "Left Toes X-Ray (AP & LAT)" },
    { code: "TOE-L-PA", name: "Left Toes X-Ray (PA)" },
    { code: "TOE-L-LAT", name: "Left Toes X-Ray (Lateral)" },
    { code: "TOE-L-AP", name: "Left Toes X-Ray (AP)" },
    { code: "ABD-DEC", name: "Abdomen X-Ray (Decubitus)" },
    { code: "USS-NT", name: "Neck Ultrasound" },
    { code: "USS-TVS", name: "Pelvic Ultrasound (Transvaginal Scan - TVS)" },
    { code: "USS-PTA", name: "Pelvic Ultrasound (Transabdominal)" },
    { code: "USS-FAS", name: "FAST Scan (Abdominal Windows)" },
    { code: "USS-EFS", name: "FAST Scan (Extended eFAST)" },
    { code: "USS-CRD", name: "Carotid Doppler Ultrasound" },
    { code: "USS-RAD", name: "Renal Artery Doppler Ultrasound" },
    { code: "USS-DVT", name: "Lower Limb Venous Doppler (DVT Scan)" },
    { code: "USS-OB-ANOM", name: "Obstetric Ultrasound (Anomaly Scan)" },
    { code: "USS-OB-NT", name: "Obstetric Ultrasound (NT Scan)" },
    { code: "USS-OB-GR", name: "Obstetric Ultrasound (Growth Scan)" },
    { code: "USS-OB-BPP", name: "Obstetric Ultrasound (Biophysical Profile)" },
    { code: "CT-SIN", name: "CT Sinuses" },
    { code: "CT-ORB", name: "CT Orbit" },
    { code: "CT-KUB", name: "CT KUB (Non-Contrast)" },
    { code: "CT-CTPA", name: "CT Pulmonary Angiogram (CTPA)" },
    { code: "CT-CTCA", name: "CT Coronary Angiography (CTCA)" },
    { code: "CT-BWC", name: "CT Brain (With Contrast)" },
    { code: "CT-BCTA", name: "CT Brain Angiography (CTA)" },
    { code: "CT-BCTV", name: "CT Brain Venography (CTV)" },
    { code: "CT-CXSP", name: "CT Cervical Spine" },
    { code: "CT-TXSP", name: "CT Thoracic Spine" },
    { code: "CT-LXSP", name: "CT Lumbar Spine" },
    { code: "CT-ABDP", name: "CT Abdomen and Pelvis (With Contrast)" },
    { code: "CT-HRCT", name: "CT Chest (HRCT)" },
    { code: "CT-LDCH", name: "CT Chest (Low Dose)" },
    { code: "CT-APST", name: "CT Chest Abdomen Pelvis (Staging)" },
    { code: "CT-URO", name: "CT Urography (3-Phase)" },
    { code: "CT-ENTR", name: "CT Enterography" },
    { code: "CT-COLN", name: "CT Colonography (Virtual Colonoscopy)" },
    { code: "CT-AORT", name: "CTA Aorta (Thoracoabdominal)" },
    { code: "CT-CARO", name: "CTA Carotid Arteries" },
    { code: "CT-RNAL", name: "CTA Renal Arteries" },
    { code: "CT-MESN", name: "CTA Mesenteric Arteries" },
    { code: "CT-PERF", name: "CT Perfusion Brain" },
    { code: "CT-TRMA", name: "CT Whole Body (Pan-Scan)" },
    { code: "CT-CBIO", name: "CT-Guided Biopsy" },
    { code: "CT-CDRN", name: "CT-Guided Drainage" },
    { code: "CT-CRFA", name: "CT-Guided Radiofrequency Ablation" },
    { code: "MRI-KNE", name: "MRI Knee" },
    { code: "MRI-SHO", name: "MRI Shoulder" },
    { code: "MRI-MRCP", name: "MRCP (MR Cholangiopancreatography)" },
    { code: "MRI-MRA", name: "MRA Brain (TOF)" },
    { code: "MRI-MRV", name: "MRV Brain" },
    { code: "CON-BSW", name: "Barium Swallow (Single Contrast)" },
    { code: "CON-BSD", name: "Barium Swallow (Double Contrast)" },
    { code: "CON-BML", name: "Barium Meal (Single Contrast)" },
    { code: "CON-BMD", name: "Barium Meal (Double Contrast)" },
    { code: "CON-SBFT", name: "Small Bowel Follow-Through (SBFT)" },
    { code: "CON-ECLS", name: "Enteroclysis" },
    { code: "CON-BES", name: "Barium Enema (Single Contrast)" },
    { code: "CON-BED", name: "Barium Enema (Double Contrast)" },
    { code: "CON-WSE", name: "Water-Soluble Contrast Enema" },
    { code: "CON-IVUP", name: "IVU/IVP (Plain + Contrast + Delayed)" },
    { code: "CON-RGU", name: "Retrograde Urethrogram (RGU)" },
    { code: "CON-CYSG", name: "Cystogram" },
    { code: "CON-NEPG", name: "Nephrostogram" },
    { code: "CON-LPGM", name: "Loopogram" },
    { code: "CON-PTCG", name: "Percutaneous Transhepatic Cholangiogram (PTC)" },
    { code: "CON-DSAC", name: "Cerebral Angiogram (DSA)" },
    { code: "CON-CANG", name: "Coronary Angiogram" },
    { code: "CON-PANG", name: "Pulmonary Angiogram" },
    { code: "CON-VENG", name: "Venogram" },
    { code: "CON-ARTH", name: "Arthrogram" },
    { code: "CON-MYLG", name: "Myelogram" },
    { code: "END-OGD", name: "OGD / EGD (Diagnostic)" },
    { code: "END-OGB", name: "OGD / EGD (With Biopsy)" },
    { code: "END-COL", name: "Colonoscopy (Diagnostic)" },
    { code: "END-COB", name: "Colonoscopy (With Biopsy)" },
    { code: "END-COP", name: "Colonoscopy (With Polypectomy)" },
    { code: "END-SIG", name: "Flexible Sigmoidoscopy" },
    { code: "END-PRO", name: "Proctoscopy" },
    { code: "END-ERCP", name: "ERCP (Diagnostic)" },
    { code: "END-ERST", name: "ERCP (With Stenting)" },
    { code: "END-EUS", name: "Endoscopic Ultrasound (EUS)" },
    { code: "END-EFNA", name: "Endoscopic Ultrasound (EUS-FNA)" },
    { code: "END-BRNC", name: "Flexible Bronchoscopy" },
    { code: "END-EBUS", name: "EBUS (Endobronchial Ultrasound)" },
    { code: "END-LARY", name: "Flexible Laryngoscopy" },
    { code: "END-CYST", name: "Flexible Cystoscopy" },
    { code: "END-URTR", name: "Ureteroscopy" },
    { code: "END-HYST", name: "Hysteroscopy (Diagnostic)" },
    { code: "END-COLP", name: "Colposcopy" },
    { code: "END-THOR", name: "Medical Thoracoscopy" },
    { code: "END-VATS", name: "VATS (Diagnostic)" },
    { code: "ECG-6LD", name: "6-Lead ECG" },
    { code: "ECG-3LD", name: "3-Lead ECG (Monitoring)" },
    { code: "ECG-15L", name: "15-Lead ECG" },
    { code: "ECG-18L", name: "18-Lead ECG" },
    { code: "ECG-SAE", name: "Signal-Averaged ECG (SAECG)" },
    { code: "ECG-H24", name: "Holter Monitor (24-hour)" },
    { code: "ECG-H48", name: "Holter Monitor (48-hour)" },
    { code: "ECG-H72", name: "Holter Monitor (72-hour)" },
    { code: "ECG-H7D", name: "Holter Monitor (7-day)" },
    { code: "ECG-H14", name: "Holter Monitor (14-day)" },
    { code: "ECG-ELR", name: "External Loop Recorder (30-day)" },
    { code: "ECG-ESTB", name: "Exercise Stress Test (Bruce Protocol)" },
    { code: "ECG-ESTM", name: "Exercise Stress Test (Modified Bruce)" },
    { code: "ECG-TMT", name: "Treadmill Test (TMT)" },
    { code: "ECG-TILT", name: "Tilt Table Test" },
    { code: "ECHO-CLR", name: "Colour Doppler Echocardiography" },
    { code: "ECHO-PWD", name: "PW Doppler Echocardiography" },
    { code: "ECHO-CWD", name: "CW Doppler Echocardiography" },
    { code: "ECHO-TDI", name: "Tissue Doppler Imaging (TDI)" },
    { code: "ECHO-3D", name: "3D Echocardiography" },
    { code: "ECHO-4D", name: "4D Echocardiography" },
    { code: "ECHO-BUB", name: "Contrast Echo (Bubble Study)" },
    { code: "ECHO-FET", name: "Fetal Echocardiography" },
    { code: "CRD-CACS", name: "CT Calcium Scoring (CAC)" },
    { code: "CRD-CMR", name: "Cardiac MRI (CMR)" },
    { code: "CRD-MPI", name: "Nuclear Myocardial Perfusion Imaging" },
    { code: "CRD-EPS", name: "Electrophysiology Study (EPS)" },
  ];

  for (const test of missingRadiologyTests) {
    const existingByCode = await prisma.diagnosticTest.findFirst({
      where: {
        organizationId: orgId,
        code: test.code,
      },
      select: { id: true },
    });

    if (existingByCode) {
      const grouping = deriveRadiologyGrouping(test.name);
      await seedTest({
        code: test.code,
        name: test.name,
        type: TestType.RADIOLOGY,
        department: Department.RADIOLOGY,
        categoryId: "cat-imaging",
        price: 7000,
        turnaroundMinutes: 60,
        description: "Standardized radiology catalog test",
        groupKey: grouping.groupKey,
        viewType: grouping.viewType,
        isDefaultInGroup: grouping.isDefaultInGroup,
        fields: makeRadiologyWorkflowFields(),
      });
      continue;
    }

    const existingByName = await prisma.diagnosticTest.findFirst({
      where: {
        organizationId: orgId,
        name: test.name,
      },
      select: { id: true },
    });

    if (existingByName) continue;

    const grouping = deriveRadiologyGrouping(test.name);
    await seedTest({
      code: test.code,
      name: test.name,
      type: TestType.RADIOLOGY,
      department: Department.RADIOLOGY,
      categoryId: "cat-imaging",
      price: 7000,
      turnaroundMinutes: 60,
      description: "Standardized radiology catalog test",
      groupKey: grouping.groupKey,
      viewType: grouping.viewType,
      isDefaultInGroup: grouping.isDefaultInGroup,
      fields: makeRadiologyWorkflowFields(),
    });
  }

  const structuredCardiologyTests: Array<{
    code: string;
    name: string;
    price: number;
    turnaroundMinutes: number;
    template: "ECG" | "STANDARD";
  }> = [
    { code: "ECG-R12", name: "Resting ECG (12-lead)", price: 8000, turnaroundMinutes: 45, template: "ECG" },
    { code: "ECG-STR", name: "Stress ECG", price: 12000, turnaroundMinutes: 60, template: "ECG" },
    { code: "ECG-HOL", name: "Ambulatory ECG (Holter)", price: 18000, turnaroundMinutes: 90, template: "ECG" },
    { code: "ECHO-2D", name: "2D Echocardiography", price: 18000, turnaroundMinutes: 60, template: "STANDARD" },
    { code: "ECHO-DOP", name: "Doppler Echocardiography", price: 22000, turnaroundMinutes: 60, template: "STANDARD" },
    { code: "ECHO-STR", name: "Stress Echocardiography", price: 25000, turnaroundMinutes: 75, template: "STANDARD" },
    { code: "ECHO-TEE", name: "Transesophageal Echo (TEE)", price: 35000, turnaroundMinutes: 90, template: "STANDARD" },
    { code: "CRD-CAR", name: "Carotid Doppler", price: 18000, turnaroundMinutes: 60, template: "STANDARD" },
    { code: "CRD-PER", name: "Peripheral Doppler", price: 18000, turnaroundMinutes: 60, template: "STANDARD" },
    { code: "CRD-VEN", name: "Venous Doppler", price: 18000, turnaroundMinutes: 60, template: "STANDARD" },
    { code: "CRD-ART", name: "Arterial Doppler", price: 18000, turnaroundMinutes: 60, template: "STANDARD" },
  ];

  for (const test of structuredCardiologyTests) {
    await seedTest({
      code: test.code,
      name: test.name,
      type: TestType.RADIOLOGY,
      department: Department.RADIOLOGY,
      categoryId: "cat-cardiology",
      price: test.price,
      turnaroundMinutes: test.turnaroundMinutes,
      description: "Structured cardiology catalog test",
      fields: test.template === "ECG" ? makeEcgWorkflowFields() : makeRadiologyWorkflowFields(),
    });
  }

  // 25b. Force-sync PSA templates for existing databases (even when test names already exist)
  const psaPanelFields: SeedField[] = [
    {
      label: "Total PSA",
      fieldKey: "psa_total",
      fieldType: FieldType.NUMBER,
      unit: "ng/mL",
      normalMin: 0,
      normalMax: 4.0,
      referenceNote: "Typical adult male range 0.0-4.0 ng/mL; may be acceptable up to 10.0 ng/mL in men over 70 years.",
      sortOrder: 1,
    },
    {
      label: "Free PSA",
      fieldKey: "psa_free",
      fieldType: FieldType.NUMBER,
      unit: "ng/mL",
      normalMin: 0,
      normalMax: 1.0,
      sortOrder: 2,
    },
    {
      label: "Percentage Free PSA",
      fieldKey: "psa_percent_free",
      fieldType: FieldType.NUMBER,
      unit: "%",
      normalMin: 24,
      normalMax: 100,
      referenceNote: "Normal cutoff >=24%.",
      sortOrder: 3,
    },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ];

  await syncExistingTestFieldsByName({
    name: "PROSTATE SPECIFIC ANTIGEN (PSA)",
    type: TestType.LAB,
    fields: psaPanelFields,
  });

  await syncExistingTestFieldsByName({
    name: "PROSTATE SPECIFIC ANTIGEN (FREE)",
    type: TestType.LAB,
    fields: [
      {
        label: "Free PSA",
        fieldKey: "psa_free",
        fieldType: FieldType.NUMBER,
        unit: "ng/mL",
        normalMin: 0,
        normalMax: 1.0,
        sortOrder: 1,
      },
      {
        label: "Percentage Free PSA",
        fieldKey: "psa_percent_free",
        fieldType: FieldType.NUMBER,
        unit: "%",
        normalMin: 24,
        normalMax: 100,
        isRequired: false,
        referenceNote: "Normal cutoff >=24%.",
        sortOrder: 2,
      },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    ],
  });

  // Fallback: sync any legacy/custom PSA tests by name fragment (e.g. existing LB****PSA codes)
  const legacyPsaTests = await prisma.diagnosticTest.findMany({
    where: {
      organizationId: orgId,
      name: { contains: "PROSTATE SPECIFIC ANTIGEN", mode: "insensitive" },
      type: TestType.LAB,
    },
    select: { id: true, name: true },
  });

  for (const test of legacyPsaTests) {
    const isFree = test.name.toUpperCase().includes("(FREE)");
    const fields = isFree
      ? [
          {
            label: "Free PSA",
            fieldKey: "psa_free",
            fieldType: FieldType.NUMBER,
            unit: "ng/mL",
            normalMin: 0,
            normalMax: 1.0,
            sortOrder: 1,
          },
          {
            label: "Percentage Free PSA",
            fieldKey: "psa_percent_free",
            fieldType: FieldType.NUMBER,
            unit: "%",
            normalMin: 24,
            normalMax: 100,
            isRequired: false,
            referenceNote: "Normal cutoff >=24%.",
            sortOrder: 2,
          },
          { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
        ]
      : psaPanelFields;

    const enriched = withReferenceMetadata(test.name, TestType.LAB, fields);
    await replaceResultTemplateFields(
      test.id,
      mapTemplateFields(test.id, enriched),
      `legacyPsaSync:${test.name}`
    );
  }

  // 26. Bulk catalog expansion (Lab + Radiology master list)
  const extraCategories = await Promise.all([
    prisma.testCategory.upsert({
      where: { id: "cat-molecular" },
      update: {},
      create: { id: "cat-molecular", name: "Molecular / PCR", description: "Molecular diagnostics and PCR assays" },
    }),
    prisma.testCategory.upsert({
      where: { id: "cat-cardiac" },
      update: {},
      create: { id: "cat-cardiac", name: "Cardiac Markers", description: "Cardiac and heart-related markers" },
    }),
  ]);
  console.log(`? ${extraCategories.length} additional categories ready`);

  const rawLabTests = [
    "ALKALINE PHOSPHATASE (ALP)",
    "B10 CHEMISTRY PANEL HBA1C",
    "LIPID PROFILE",
    "TRIGLYCERIDE",
    "CHOLESTEROL (TOTAL)",
    "HDL-C",
    "AST (SGOT)",
    "ALT (SGPT)",
    "GGT",
    "TOTAL BILIRUBIN",
    "DIRECT BILIRUBIN",
    "LDL-C",
    "PROTEIN (TOTAL)",
    "VLDL-C",
    "ALBUMIN",
    "THYROID STIMULATING HORMONE (TSH)",
    "THYROXINE (T4 FREE)",
    "THYROXINE (T4 TOTAL)",
    "TRIIODOTHYRONINE (T3 TOTAL)",
    "TRIIODOTHYRONINE (T3 FREE)",
    "THYROID FUNCTION TESTS (TFT)",
    "THYROID ANTIBODY RECEPTOR (TRAb)",
    "ELECTROLYTES",
    "UREA",
    "CREATININE",
    "BLOOD GASES",
    "BLOOD PH",
    "OXYGEN (O2)",
    "CARBON DIOXIDE (CO2)",
    "CALCIUM (TOTAL)",
    "IONIZED CALCIUM",
    "LACTATE",
    "URIC ACID",
    "PREGNANCY TEST",
    "CRP",
    "CREATINE KINASE",
    "PROCALCITONIN",
    "AMYLASE",
    "LIPASE",
    "COMPREHENSIVE METABOLIC PANEL (CMP)",
    "PROTEIN ELECTROPHORESIS",
    "PROSTATE SPECIFIC ANTIGEN (PSA)",
    "PROSTATE SPECIFIC ANTIGEN (FREE)",
    "CARCINOEMBRYONIC ANTIGEN (CEA)",
    "ALPHA-FETOPROTEIN (AFP)",
    "CA-125 TEST",
    "CA 19-9",
    "CD4 T CELL COUNT",
    "CD4 T CELL PERCENTAGE",
    "CD8 T CELL COUNT",
    "HIV 1 & II CONFIRMATORY TEST",
    "HUMAN CHORIONIC GONADOTROPIN (B-HCG)",
    "PROGESTERONE",
    "FOLLICLE STIMULATING HORMONE (FSH)",
    "LUTEINIZING HORMONE (LH)",
    "PROLACTIN",
    "HORMONAL IMMUNOASSAY PANEL",
    "ANTI-MULLERIAN HORMONE (AMH)",
    "OESTROGEN (E2)",
    "VITAMIN B12",
    "VITAMIN D",
    "FERRITIN",
    "SERUM IRON",
    "TOTAL IRON BINDING CAPACITY (TIBC)",
    "PARATHYROID HORMONE (PTH)",
    "DEHYDROEPIANDROSTERONE SULFATE (DHEA-S)",
    "CORTISOL",
    "TESTOSTERONE",
    "MICROALBUMIN",
    "ADRENOCORTICOTROPIC HORMONE (ACTH)",
    "HBsAg-QUANTITATIVE",
    "HUMAN GROWTH HORMONE",
    "ANTI NUCLEAR ANTIBODY (ANA)",
    "DOUBLE STRANDED DNA TEST (ds-DNA)",
    "BRAIN NATRIURETIC PEPTIDE (NT-proBNP)",
    "CK-MB",
    "TROPONIN T",
    "TROPONIN I",
    "PROSTATE BIOPSY",
    "LIVER BIOPSY",
    "HBV 5 PANEL TEST",
    "HBsAb-QUANTITATIVE",
    "HBeAg-QUANTITATIVE",
    "HBeAb-QUANTITATIVE",
    "HBcAb-QUANTITATIVE",
    "HBV DNA PANEL",
    "HBsAg-QUALITATIVE",
    "HBsAb-QUALITATIVE",
    "HBeAg-QUALITATIVE",
    "HBeAb-QUALITATIVE",
    "HBcAb-QUALITATIVE",
    "URINE M/C/S",
    "STOOL M/C/S",
    "SPUTUM M/C/S",
    "BLOOD CULTURE/SENSITIVITY",
    "HIGH VAGINAL SWAB (HVS) M/C/S",
    "ENDOCERVICAL SWAB (ECS) M/C/S",
    "URETHRAL SWAB M/C/S",
    "SEMEN M/C/S",
    "SKIN/NAIL SCRAPING M/C/S",
    "OTHER SWABS/FLUID M/C/S",
    "URINALYSIS",
    "STOOL ANALYSIS",
    "SEMEN ANALYSIS",
    "SPUTUM AFB (X2)",
    "HIV SCREENING",
    "GRAM STAINING",
    "MANTOUX TEST",
    "SKIN SCRAPING ANALYSIS",
    "H. PYLORI SCREENING",
    "ASO TITRE",
    "RHEUMATOID FACTOR",
    "HEPATITIS A SCREENING",
    "BLOOD FILM",
    "MALARIA PARASITES (MP)",
    "BLOOD GROUP",
    "GENOTYPE",
    "DIRECT COOMBS TEST",
    "INDIRECT COOMBS TEST",
    "CROSS MATCHING",
    "HB ELECTROPHORESIS",
    "GENOTYPING (CONFIRMATORY)",
    "PROTHROMBIN TIME",
    "APTT",
    "FIBRINOGEN",
    "ESR",
    "HAEMOGLOBIN (HB)",
    "DNA PATERNITY TEST",
    "HBV DNA VIRAL LOAD",
    "HBV RNA BY RT-PCR",
    "HCV RNA VIRAL LOAD",
    "HCV GENOTYPING",
    "TUBERCULOSIS ANTIGEN TEST",
    "HBV QUALITATIVE (CONFIRMATORY TEST)",
    "HCV QUALITATIVE (CONFIRMATORY TEST)",
    "HEPATITIS B SCREENING",
    "HEPATITIS C SCREENING",
    "CHLAMYDIA",
    "VDRL",
    "BRUCELLA SCREENING",
    // New entries from docx / Nigerian lab practice
    "GONORRHOEA SCREENING",
    "TRICHOMONAS VAGINALIS",
    "CANDIDA SCREENING",
    "AFLATOXIN B1",
    "DRUG SCREEN (URINE)",
    "ALCOHOL LEVEL",
    "CERULOPLASMIN",
    "COPPER (SERUM)",
    "ZINC (SERUM)",
    "MAGNESIUM (SERUM)",
    "PHOSPHATE (SERUM)",
    "IMMUNOGLOBULIN G (IgG)",
    "IMMUNOGLOBULIN M (IgM)",
    "IMMUNOGLOBULIN A (IgA)",
    "IMMUNOGLOBULIN E (IgE)",
    "COMPLEMENT C3",
    "COMPLEMENT C4",
    "ANTI-STREPTOLYSIN O (ASO) TITRE",
    "ANTI-CCP ANTIBODY",
    "ANTI-dsDNA ANTIBODY",
    "ANTI-TPO ANTIBODY",
    "ANTI-THYROGLOBULIN ANTIBODY",
    "SERUM PROTEIN C",
    "SERUM PROTEIN S",
    "D-DIMER",
    "ACTIVATED PROTEIN C RESISTANCE",
    "LUPUS ANTICOAGULANT",
    "ANTIPHOSPHOLIPID ANTIBODIES",
    "PERIPHERAL BLOOD FILM",
    "RETICULOCYTE COUNT",
    "OSMOTIC FRAGILITY TEST",
    "HAEMATOCRIT (PCV)",
    "FAECAL OCCULT BLOOD (FOB)",
    "TYPHOID IGM/IGG RAPID TEST",
    "DENGUE NS1 ANTIGEN",
    "YELLOW FEVER IGM",
    "MONKEYPOX PCR",
    "COVID-19 ANTIGEN",
    "COVID-19 ANTIBODY (IGM/IGG)",
    "HEPATITIS E SCREENING",
    "HEPATITIS D SCREENING",
    "CYTOMEGALOVIRUS (CMV) IGM",
    "EPSTEIN-BARR VIRUS (EBV) IGM",
    "TOXOPLASMA IGM",
    "RUBELLA IGM",
    "MEASLES IGM",
    "MENINGITIS SCREENING",
    "BLOOD LEAD LEVEL",
    "SERUM FOLATE",
    "ORAL GLUCOSE TOLERANCE TEST (OGTT)",
    "GESTATIONAL OGTT (100g)",
  ];

  const rawRadiologyTests = [
    "ABDOMINAL SCAN",
    "PELVIC SCAN",
    "OBSTETRIC/FETAL ULTRASOUND",
    "BREAST SCAN",
    "OCCULAR SCAN",
    "TRANSRECTAL/PROSTATE SCAN",
    "FOLLICULOMETRY (FOLLICULAR TRACKING)",
    "SONO-HSG",
    "PROSTATE BIOPSY (ULTRASOUND GUIDED)",  
    "LIVER BIOPSY (ULTRASOUND GUIDED)",
    "KIDNEY BIOPSY (ULTRASOUND GUIDED)",
    "BREAST BIOPSY (ULTRASOUND GUIDED)",
    "THYROID BIOPSY (ULTRASOUND GUIDED)",
    "DIGITAL X-RAY SKULL",
    "DIGITAL X-RAY MANDIBLE",
    "DIGITAL X-RAY TMJ",
    "DIGITAL X-RAY CHEST",
    "DIGITAL X-RAY SHOULDER",
    "DIGITAL X-RAY HUMERUS",
    "DIGITAL X-RAY ELBOW",
    "DIGITAL X-RAY FOREARM",
    "DIGITAL X-RAY WRIST",
    "DIGITAL X-RAY HAND",
    "DIGITAL X-RAY CERVICAL SPINE",
    "DIGITAL X-RAY THORACIC SPINE",
    "DIGITAL X-RAY LUMBO-SACRAL SPINE",
    "DIGITAL X-RAY PELVIS/HIP",
    "DIGITAL X-RAY FEMUR",
    "DIGITAL X-RAY KNEE",
    "DIGITAL X-RAY TIBIA-FIBULA",
    "DIGITAL X-RAY ANKLE",
    "DIGITAL X-RAY FOOT",
    "DIGITAL X-RAY PARANASAL SINUSES",
    "DIGITAL X-RAY POST NASAL SPACE",
    "DIGITAL X-RAY TRANS-CRANIAL",
    "BARIUM MEAL/FOLLOW THROUGH",
    "BARIUM SWALLOW",
    "BARIUM ENEMA",
    "INTRAVENOUS UROGRAPHY (IVU)",
    "HYSTEROSALPINGOGRAPHY (HSG)",
    "FISTULOGRAPHY",
    "RETROGRADE PYELOGRAPHY (RUCG)",
    "MICTURATING CYSTOURETHROGRAPHY (MCUG)",
    "SIALOGRAPHY",
    "MAMMOGRAPHY",
    "CT HEAD ROUTINE",
    "CT HEAD NEURO",
    "CT INNER EAR",
    "CT SINUS",
    "CT ORBIT",
    "CT DENTAL",
    "CT NECK",
    "CT SHOULDER",
    "CT LOWER EXTREMITIES",
    "CT CARDIAC STUDY",
    "CT VASCULAR",
    "CT CRANIAL ANGIOGRAPHY",
    "CT CAROTID ANGIOGRAPHY",
    "CT CAROTID DIGITAL SUBTRACTION",
    "CT THORACIC ANGIOGRAPHY",
    "UPPER GI ENDOSCOPY",
    "SIGMOIDOSCOPY/COLONOSCOPY",
    "PROCTOSCOPY",
    "CT THORAX ROUTINE",
    "CT THORAX HR",
    "CT LUNG LOW DOSE",
    "CT CERVICAL SPINE",
    "CT THORACIC SPINE",
    "CT LUMBO-SACRAL SPINE",
    "CT PELVIS",
    "CT UPPER EXTREMITIES",
    // Additional Nigeria-relevant radiology
    "THYROID SCAN",
    "SCROTAL/TESTICULAR SCAN",
    "RENAL SCAN",
    "NECK SCAN",
    "LIVER/GALLBLADDER SCAN",
    "MUSCULOSKELETAL SCAN",
    "DIGITAL X-RAY CLAVICLE",
    "DIGITAL X-RAY RIBS",
    "DIGITAL X-RAY STERNUM",
    "DIGITAL X-RAY SACRUM/COCCYX",
    "DIGITAL X-RAY ABDOMEN (ERECT)",
    "DIGITAL X-RAY ABDOMEN (SUPINE)",
    "SALIVARY GLAND SCAN",
    "SOFT TISSUE SCAN",
    "MRI BRAIN",
    "MRI SPINE (CERVICAL)",
    "MRI SPINE (LUMBAR)",
    "MRI KNEE",
    "MRI SHOULDER",
    "MRI ABDOMEN/PELVIS",
    "PLAIN X-RAY ABDOMEN",
    "DIGITAL X-RAY FACIAL BONES",
    "DIGITAL X-RAY MASTOID",
  ];

  function normalizeName(input: string) {
    return input
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .replace(/\|/g, "")
      .trim();
  }

  function generateCode(prefix: "LB" | "RD", name: string, index: number) {
    const initials = name
      .replace(/[^A-Za-z0-9 ]+/g, " ")
      .split(" ")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((chunk) => chunk[0].toUpperCase())
      .join("");
    return `${prefix}${String(index + 1).padStart(3, "0")}${initials || "TS"}`;
  }

  function inferLabCategory(name: string) {
    const n = name.toLowerCase();
    if (n.includes("culture") || n.includes("m/c/s") || n.includes("swab") || n.includes("stool") || n.includes("sputum") || n.includes("gram") || n.includes("mantoux")) {
      return "cat-micro";
    }
    if (n.includes("pcr") || n.includes("dna") || n.includes("rna") || n.includes("viral load") || n.includes("genotyping")) {
      return "cat-molecular";
    }
    if (n.includes("coombs") || n.includes("blood film") || n.includes("haemoglobin") || n.includes("fibrinogen") || n.includes("aptt") || n.includes("esr") || n.includes("cross match") || n.includes("blood group") || n.includes("reticulocyte") || n.includes("sickling") || n.includes("haematocrit") || n.includes("g6pd") || n.includes("bleeding time") || n.includes("peripheral blood")) {
      return "cat-haematology";
    }
    if (n.includes("troponin") || n.includes("ck-mb") || n.includes("nt-probnp") || n.includes("cardiac")) {
      return "cat-cardiac";
    }
    if (n.includes("hiv") || n.includes("hepatitis") || n.includes("vdrl") || n.includes("brucella") || n.includes("hbs") || n.includes("hbe") || n.includes("hbcab") || n.includes("rf\b") || n.includes("ana") || n.includes("dengue") || n.includes("typhoid") || n.includes("leptospira") || n.includes("igm") || n.includes("igg") || n.includes("antigen") || n.includes("antibody") || n.includes("h. pylori")) {
      return "cat-serology";
    }
    if (n.includes("urine") || n.includes("urinalysis") || n.includes("microalbumin")) {
      return "cat-urine";
    }
    return "cat-chemistry";
  }

  const LAB_FIELD_LIBRARY: Record<string, SeedField[]> = {
  "ALKALINE PHOSPHATASE (ALP)": [
    { label: "Alkaline Phosphatase (ALP)", fieldKey: "alp", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 44, normalMax: 147, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "B10 CHEMISTRY PANEL HBA1C": [
    { label: "HbA1c", fieldKey: "hba1c", fieldType: FieldType.NUMBER, unit: "%", normalMin: 0.0, normalMax: 6.5, sortOrder: 1 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.DROPDOWN, options: "Normal (<5.7%),Prediabetes (5.7-6.4%),Diabetes (>=6.5%)", isRequired: false, sortOrder: 2 },
    { label: "Estimated Average Glucose", fieldKey: "eag", fieldType: FieldType.NUMBER, unit: "mg/dL", isRequired: false, sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "FULL BLOOD COUNT": [
    { label: "Haemoglobin", fieldKey: "haemoglobin", fieldType: FieldType.NUMBER, unit: "g/dL", normalMin: 12, normalMax: 18, referenceNote: "Template style supports reporting as g/dL with optional percent equivalent, e.g. 12.6 g/dL (86%).", sortOrder: 1 },
    { label: "Haemoglobin (%)", fieldKey: "haemoglobin_percent", fieldType: FieldType.NUMBER, unit: "%", normalMin: 80, normalMax: 120, isRequired: false, sortOrder: 2 },
    { label: "PCV / Haematocrit", fieldKey: "pcv", fieldType: FieldType.NUMBER, unit: "%", normalMin: 35, normalMax: 53, sortOrder: 3 },
    { label: "WBC Count", fieldKey: "wbc", fieldType: FieldType.NUMBER, unit: "x10^9/L", normalMin: 4, normalMax: 11, sortOrder: 4 },
    { label: "Neutrophils", fieldKey: "neutrophils", fieldType: FieldType.NUMBER, unit: "%", normalMin: 40, normalMax: 75, sortOrder: 5 },
    { label: "Lymphocytes", fieldKey: "lymphocytes", fieldType: FieldType.NUMBER, unit: "%", normalMin: 20, normalMax: 45, sortOrder: 6 },
    { label: "Monocytes", fieldKey: "monocytes", fieldType: FieldType.NUMBER, unit: "%", normalMin: 2, normalMax: 10, sortOrder: 7 },
    { label: "Eosinophils", fieldKey: "eosinophils", fieldType: FieldType.NUMBER, unit: "%", normalMin: 1, normalMax: 6, sortOrder: 8 },
    { label: "Basophils", fieldKey: "basophils", fieldType: FieldType.NUMBER, unit: "%", normalMin: 0, normalMax: 1, sortOrder: 9 },
    { label: "Platelet Count", fieldKey: "platelets", fieldType: FieldType.NUMBER, unit: "x10^9/L", normalMin: 150, normalMax: 400, sortOrder: 10 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 11 },
  ],
  "FASTING BLOOD SUGAR": [
    { label: "Glucose Level (SI)", fieldKey: "glucose_mmol_l", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 4.2, normalMax: 6.1, referenceNote: "Conventional equivalent range: 76-110 mg/dL.", sortOrder: 1 },
    { label: "Glucose Level (Conventional)", fieldKey: "glucose_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 76, normalMax: 110, isRequired: false, referenceNote: "SI equivalent range: 4.2-6.1 mmol/L.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "RANDOM BLOOD SUGAR": [
    { label: "Glucose Level (SI)", fieldKey: "glucose_mmol_l", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 4.1, normalMax: 7.2, referenceNote: "Conventional equivalent range: 74-131 mg/dL.", sortOrder: 1 },
    { label: "Glucose Level (Conventional)", fieldKey: "glucose_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 74, normalMax: 131, isRequired: false, referenceNote: "SI equivalent range: 4.1-7.2 mmol/L.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "STOOL ANALYSIS": [
    { label: "Colour", fieldKey: "colour", fieldType: FieldType.DROPDOWN, options: "Brown,Yellow,Black,Green,Red,Pale", sortOrder: 1 },
    { label: "Consistency", fieldKey: "consistency", fieldType: FieldType.DROPDOWN, options: "Formed,Semi-formed,Loose,Watery", sortOrder: 2 },
    { label: "Mucus", fieldKey: "mucus", fieldType: FieldType.DROPDOWN, options: "Absent,Present", sortOrder: 3 },
    { label: "Blood", fieldKey: "blood", fieldType: FieldType.DROPDOWN, options: "Absent,Present", sortOrder: 4 },
    { label: "Scolex", fieldKey: "scolex", fieldType: FieldType.DROPDOWN, options: "Absent,Present", isRequired: false, sortOrder: 5 },
    { label: "Trophozoites", fieldKey: "trophozoites", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 6 },
    { label: "Cyst(s)", fieldKey: "cysts", fieldType: FieldType.DROPDOWN, options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 7 },
    { label: "Ova / Eggs", fieldKey: "ova_cyst", fieldType: FieldType.DROPDOWN, options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 8 },
    { label: "Yeast Cells", fieldKey: "yeast_cells", fieldType: FieldType.DROPDOWN, options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 9 },
    { label: "Starch Granules", fieldKey: "starch_granules", fieldType: FieldType.DROPDOWN, options: STOOL_ANALYSIS_PLUS_OPTIONS, isRequired: false, sortOrder: 10 },
    { label: "Calcium Oxalate", fieldKey: "calcium_oxalate", fieldType: FieldType.DROPDOWN, options: "Absent,Present", isRequired: false, sortOrder: 11 },
    { label: "Pus Cells (hpf)", fieldKey: "pus_cells", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 12 },
    { label: "RBCs (hpf)", fieldKey: "rbcs", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 13 },
    { label: "Occult Blood (FOB)", fieldKey: "occult_blood", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", isRequired: false, sortOrder: 14 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 15 },
  ],
  "LIPID PROFILE": [
    { label: "Cholesterol (Total) - SI", fieldKey: "cholesterol_total_mmol_l", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.0, normalMax: 5.2, referenceNote: "Conventional equivalent: <200 mg/dL.", sortOrder: 1 },
    { label: "Cholesterol (Total) - Conventional", fieldKey: "cholesterol_total_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMax: 200, normalText: "<200 mg/dL", isRequired: false, referenceNote: "SI equivalent: 3.0-5.2 mmol/L.", sortOrder: 2 },
    { label: "Triglyceride", fieldKey: "triglyceride", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0, normalMax: 1.71, sortOrder: 3 },
    { label: "HDL-C", fieldKey: "hdl_c", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0.91, normalText: "High risk if <0.91 mmol/L", referenceNote: "High risk if value is below 0.91 mmol/L.", sortOrder: 4 },
    { label: "LDL-C", fieldKey: "ldl_c", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0, normalMax: 4.9, sortOrder: 5 },
    { label: "VLDL-C - SI", fieldKey: "vldl_c_mmol_l", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0.13, normalMax: 0.78, isRequired: false, referenceNote: "Converted from conventional range 5-30 mg/dL.", sortOrder: 6 },
    { label: "VLDL-C - Conventional", fieldKey: "vldl_c_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 5, normalMax: 30, isRequired: false, sortOrder: 7 },
    { label: "Risk Comment", fieldKey: "risk_comment", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 8 },
  ],
  "TRIGLYCERIDE": [
    { label: "Triglyceride (SI)", fieldKey: "triglyceride", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0, normalMax: 1.71, referenceNote: "Conventional equivalent range: 0-150 mg/dL.", sortOrder: 1 },
    { label: "Triglyceride (Conventional)", fieldKey: "triglyceride_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 0, normalMax: 150, isRequired: false, referenceNote: "SI equivalent range: 0-1.71 mmol/L.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "CHOLESTEROL (TOTAL)": [
    { label: "Cholesterol (Total) - SI", fieldKey: "cholesterol_total_mmol_l", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.0, normalMax: 5.2, referenceNote: "Conventional equivalent: <200 mg/dL.", sortOrder: 1 },
    { label: "Cholesterol (Total) - Conventional", fieldKey: "cholesterol_total_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMax: 200, normalText: "<200 mg/dL", isRequired: false, referenceNote: "SI equivalent: 3.0-5.2 mmol/L.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HDL-C": [
    { label: "HDL-C (SI)", fieldKey: "hdl_c", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0.91, normalText: "High risk if <0.91 mmol/L", referenceNote: "Conventional equivalent high-risk cutoff: <35 mg/dL.", sortOrder: 1 },
    { label: "HDL-C (Conventional)", fieldKey: "hdl_c_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 35, normalText: "High risk if <35 mg/dL", isRequired: false, referenceNote: "SI equivalent high-risk cutoff: <0.91 mmol/L.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "AST (SGOT)": [
    { label: "AST (SGOT)", fieldKey: "ast", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 0, normalMax: 12, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ALT (SGPT)": [
    { label: "ALT (SGPT)", fieldKey: "alt", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 0, normalMax: 12, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "GGT": [
    { label: "GGT", fieldKey: "ggt", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 8, normalMax: 61, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "TOTAL BILIRUBIN": [
    { label: "Total Bilirubin", fieldKey: "total_bilirubin", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L", normalMin: 3, normalMax: 21, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "DIRECT BILIRUBIN": [
    { label: "Direct Bilirubin", fieldKey: "direct_bilirubin", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L", normalMin: 0, normalMax: 4.5, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "LDL-C": [
    { label: "LDL-C (SI)", fieldKey: "ldl_c", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0, normalMax: 4.9, referenceNote: "Conventional equivalent range: 0-190 mg/dL.", sortOrder: 1 },
    { label: "LDL-C (Conventional)", fieldKey: "ldl_c_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 0, normalMax: 190, isRequired: false, referenceNote: "SI equivalent range: 0-4.9 mmol/L.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "PROTEIN (TOTAL)": [
    { label: "Total Protein", fieldKey: "total_protein", fieldType: FieldType.NUMBER, unit: "g/dL", normalMin: 60, normalMax: 84, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "VLDL-C": [
    { label: "VLDL-C (SI)", fieldKey: "vldl_c_mmol_l", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0.13, normalMax: 0.78, isRequired: false, referenceNote: "Converted from conventional reference range 5-30 mg/dL.", sortOrder: 1 },
    { label: "VLDL-C (Conventional)", fieldKey: "vldl_c_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 5, normalMax: 30, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "ALBUMIN": [
    { label: "Albumin", fieldKey: "albumin", fieldType: FieldType.NUMBER, unit: "g/dL", normalMin: 30, normalMax: 45, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "THYROID STIMULATING HORMONE (TSH)": [
    { label: "TSH", fieldKey: "tsh", fieldType: FieldType.NUMBER, unit: "uIU/mL", normalMin: 0.4, normalMax: 4.5, sortOrder: 1 },
    { label: "Free T4", fieldKey: "free_t4", fieldType: FieldType.NUMBER, unit: "ng/dL", normalMin: 0.8, normalMax: 1.9, isRequired: false, sortOrder: 2 },
    { label: "Free T3", fieldKey: "free_t3", fieldType: FieldType.NUMBER, unit: "pg/mL", normalMin: 2.3, normalMax: 4.2, isRequired: false, sortOrder: 3 },
    { label: "Total T4", fieldKey: "total_t4", fieldType: FieldType.NUMBER, unit: "ug/dL", normalMin: 5.0, normalMax: 12.0, isRequired: false, sortOrder: 4 },
    { label: "Total T3", fieldKey: "total_t3", fieldType: FieldType.NUMBER, unit: "ng/dL", normalMin: 80, normalMax: 200, isRequired: false, sortOrder: 5 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 7 },
  ],
  "THYROXINE (T4 FREE)": [
    { label: "Free T4", fieldKey: "free_t4", fieldType: FieldType.NUMBER, unit: "ng/dL", normalMin: 0.8, normalMax: 1.9, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "THYROXINE (T4 TOTAL)": [
    { label: "Total T4", fieldKey: "total_t4", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµg/dL", normalMin: 5.0, normalMax: 12.0, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "TRIIODOTHYRONINE (T3 TOTAL)": [
    { label: "Total T3", fieldKey: "total_t3", fieldType: FieldType.NUMBER, unit: "ng/dL", normalMin: 60, normalMax: 180, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "TRIIODOTHYRONINE (T3 FREE)": [
    { label: "Free T3", fieldKey: "free_t3", fieldType: FieldType.NUMBER, unit: "pg/dL", normalMin: 130, normalMax: 450, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "THYROID FUNCTION TESTS (TFT)": [
    { label: "TSH", fieldKey: "tsh", fieldType: FieldType.NUMBER, unit: "uIU/mL", normalMin: 0.4, normalMax: 4.5, sortOrder: 1 },
    { label: "Free T4", fieldKey: "free_t4", fieldType: FieldType.NUMBER, unit: "ng/dL", normalMin: 0.8, normalMax: 1.9, sortOrder: 2 },
    { label: "Free T3", fieldKey: "free_t3", fieldType: FieldType.NUMBER, unit: "pg/mL", normalMin: 2.3, normalMax: 4.2, sortOrder: 3 },
    { label: "Total T4", fieldKey: "total_t4", fieldType: FieldType.NUMBER, unit: "ug/dL", normalMin: 5.0, normalMax: 12.0, isRequired: false, sortOrder: 4 },
    { label: "Total T3", fieldKey: "total_t3", fieldType: FieldType.NUMBER, unit: "ng/dL", normalMin: 80, normalMax: 200, isRequired: false, sortOrder: 5 },
    { label: "TSH Receptor Antibody (TRAb)", fieldKey: "trab", fieldType: FieldType.NUMBER, unit: "IU/L", normalMin: 0, normalMax: 1.75, isRequired: false, sortOrder: 6 },
    { label: "Anti-TPO Antibody", fieldKey: "anti_tpo", fieldType: FieldType.NUMBER, unit: "IU/mL", normalMin: 0, normalMax: 34, isRequired: false, sortOrder: 7 },
    { label: "Anti-Thyroglobulin Antibody", fieldKey: "anti_thyroglobulin", fieldType: FieldType.NUMBER, unit: "IU/mL", normalMin: 0, normalMax: 115, isRequired: false, sortOrder: 8 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 9 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 10 },
  ],
  "THYROID ANTIBODY RECEPTOR (TRAb)": [
    { label: "TSH Receptor Antibody (TRAb)", fieldKey: "trab", fieldType: FieldType.NUMBER, unit: "IU/L", normalMin: 0, normalMax: 1.75, sortOrder: 1 },
    { label: "Anti-TPO Antibody", fieldKey: "anti_tpo", fieldType: FieldType.NUMBER, unit: "IU/mL", normalMin: 0, normalMax: 34, isRequired: false, sortOrder: 2 },
    { label: "Anti-Thyroglobulin Antibody", fieldKey: "anti_thyroglobulin", fieldType: FieldType.NUMBER, unit: "IU/mL", normalMin: 0, normalMax: 115, isRequired: false, sortOrder: 3 },
    { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 4 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
  ],
  "ELECTROLYTES": [
    { label: "Sodium", fieldKey: "sodium", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 134, normalMax: 146, sortOrder: 1 },
    { label: "Potassium", fieldKey: "potassium", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.6, normalMax: 5.0, sortOrder: 2 },
    { label: "Chloride", fieldKey: "chloride", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 96, normalMax: 107, sortOrder: 3 },
    { label: "Bicarbonate", fieldKey: "bicarbonate", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 23, normalMax: 31, sortOrder: 4 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
  ],
  "UREA": [
    { label: "Urea (SI)", fieldKey: "urea", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 1.6, normalMax: 8.3, referenceNote: "Conventional equivalent range: 10-50 mg/dL.", sortOrder: 1 },
    { label: "Urea (Conventional)", fieldKey: "urea_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 10, normalMax: 50, isRequired: false, referenceNote: "SI equivalent range: 1.6-8.3 mmol/L.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "CREATININE": [
    { label: "Creatinine (SI)", fieldKey: "creatinine", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L", normalMin: 63, normalMax: 130, referenceNote: "Conventional equivalent range: 0.7-1.5 mg/dL.", sortOrder: 1 },
    { label: "Creatinine (Conventional)", fieldKey: "creatinine_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 0.7, normalMax: 1.5, isRequired: false, referenceNote: "SI equivalent range: 63-130 ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "BLOOD GASES": [
    { label: "pH", fieldKey: "ph", fieldType: FieldType.NUMBER, unit: "pH", normalMin: 7.35, normalMax: 7.45, sortOrder: 1 },
    { label: "pO2", fieldKey: "po2", fieldType: FieldType.NUMBER, unit: "mmHg", normalMin: 75, normalMax: 100, sortOrder: 2 },
    { label: "pCO2", fieldKey: "pco2", fieldType: FieldType.NUMBER, unit: "mmHg", normalMin: 35, normalMax: 45, sortOrder: 3 },
    { label: "HCO3-", fieldKey: "hco3", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 22, normalMax: 26, sortOrder: 4 },
    { label: "Base Excess", fieldKey: "base_excess", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: -2, normalMax: 2, isRequired: false, sortOrder: 5 },
    { label: "O2 Saturation", fieldKey: "o2_sat", fieldType: FieldType.NUMBER, unit: "%", normalMin: 95, normalMax: 100, isRequired: false, sortOrder: 6 },
    { label: "Lactate", fieldKey: "lactate", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0.5, normalMax: 2.2, isRequired: false, sortOrder: 7 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 8 },
  ],
  "BLOOD PH": [
    { label: "Blood pH", fieldKey: "blood_ph", fieldType: FieldType.NUMBER, unit: "pH", normalMin: 7.35, normalMax: 7.45, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "OXYGEN (O2)": [
    { label: "pO2", fieldKey: "po2", fieldType: FieldType.NUMBER, unit: "mmHg", normalMin: 75, normalMax: 100, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CARBON DIOXIDE (CO2)": [
    { label: "pCO2", fieldKey: "pco2", fieldType: FieldType.NUMBER, unit: "mmHg", normalMin: 35, normalMax: 45, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CALCIUM (TOTAL)": [
    { label: "Total Calcium", fieldKey: "total_calcium", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 2.0, normalMax: 2.6, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "IONIZED CALCIUM": [
    { label: "Ionized Calcium", fieldKey: "ionized_calcium", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 1.12, normalMax: 1.32, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "LACTATE": [
    { label: "Lactate", fieldKey: "lactate", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 0.5, normalMax: 2.2, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "URIC ACID": [
    { label: "Uric Acid", fieldKey: "uric_acid", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 3.5, normalMax: 7.2, referenceNote: "Template reference provided for male range: 3.5-7.2 mg/dL.", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "PREGNANCY TEST": [
    { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Indeterminate", sortOrder: 1 },
    { label: "Method", fieldKey: "method", fieldType: FieldType.DROPDOWN, options: "Urine hCG,Serum Qualitative hCG", isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "CRP": [
    { label: "CRP", fieldKey: "crp", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 0, normalMax: 1.0, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CREATINE KINASE": [
    { label: "Creatine Kinase", fieldKey: "ck_total", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 22, normalMax: 198, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "PROCALCITONIN": [
    { label: "Procalcitonin", fieldKey: "procalcitonin", fieldType: FieldType.NUMBER, unit: "ng/mL", normalMin: 0, normalMax: 0.1, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "AMYLASE": [
    { label: "Amylase", fieldKey: "amylase", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 40, normalMax: 140, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "LIPASE": [
    { label: "Lipase", fieldKey: "lipase", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 0, normalMax: 60, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "COMPREHENSIVE METABOLIC PANEL (CMP)": [
    { label: "Glucose", fieldKey: "glucose", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.9, normalMax: 5.6, sortOrder: 1 },
    { label: "Calcium", fieldKey: "calcium", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 2.0, normalMax: 2.6, sortOrder: 2 },
    { label: "Sodium", fieldKey: "sodium", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 134, normalMax: 146, sortOrder: 3 },
    { label: "Potassium", fieldKey: "potassium", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.6, normalMax: 5.0, sortOrder: 4 },
    { label: "Chloride", fieldKey: "chloride", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 96, normalMax: 107, sortOrder: 5 },
    { label: "Bicarbonate / CO2", fieldKey: "bicarbonate", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 23, normalMax: 31, sortOrder: 6 },
    { label: "Albumin", fieldKey: "albumin", fieldType: FieldType.NUMBER, unit: "g/dL", normalMin: 30, normalMax: 45, sortOrder: 7 },
    { label: "Total Protein", fieldKey: "total_protein", fieldType: FieldType.NUMBER, unit: "g/dL", normalMin: 60, normalMax: 84, sortOrder: 8 },
    { label: "ALP", fieldKey: "alp", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 40, normalMax: 129, sortOrder: 9 },
    { label: "ALT", fieldKey: "alt", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 0, normalMax: 12, sortOrder: 10 },
    { label: "AST", fieldKey: "ast", fieldType: FieldType.NUMBER, unit: "U/L", normalMin: 0, normalMax: 12, sortOrder: 11 },
    { label: "Total Bilirubin", fieldKey: "total_bilirubin", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L", normalMin: 3, normalMax: 21, sortOrder: 12 },
    { label: "Urea", fieldKey: "urea", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 1.6, normalMax: 8.3, sortOrder: 13 },
    { label: "Creatinine", fieldKey: "creatinine", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L", normalMin: 63, normalMax: 130, sortOrder: 14 },
    { label: "eGFR", fieldKey: "egfr", fieldType: FieldType.NUMBER, unit: "mL/min/1.73mÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²", normalMin: 90, normalMax: 120, isRequired: false, sortOrder: 15 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 16 },
  ],
  "PROTEIN ELECTROPHORESIS": [
    { label: "Albumin Fraction", fieldKey: "albumin_fraction", fieldType: FieldType.NUMBER, unit: "%", normalMin: 54, normalMax: 65, isRequired: false, sortOrder: 1 },
    { label: "Alpha 1", fieldKey: "alpha1", fieldType: FieldType.NUMBER, unit: "%", normalMin: 2, normalMax: 5, isRequired: false, sortOrder: 2 },
    { label: "Alpha 2", fieldKey: "alpha2", fieldType: FieldType.NUMBER, unit: "%", normalMin: 7, normalMax: 13, isRequired: false, sortOrder: 3 },
    { label: "Beta", fieldKey: "beta", fieldType: FieldType.NUMBER, unit: "%", normalMin: 8, normalMax: 14, isRequired: false, sortOrder: 4 },
    { label: "Gamma", fieldKey: "gamma", fieldType: FieldType.NUMBER, unit: "%", normalMin: 12, normalMax: 22, isRequired: false, sortOrder: 5 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, sortOrder: 6 },
  ],
  "PROSTATE SPECIFIC ANTIGEN (PSA)": [
    { label: "Total PSA", fieldKey: "psa_total", fieldType: FieldType.NUMBER, unit: "ng/mL", normalMin: 0, normalMax: 4.0, referenceNote: "Typical adult male range 0.0-4.0 ng/mL; may be acceptable up to 10.0 ng/mL in men over 70 years.", sortOrder: 1 },
    { label: "Free PSA", fieldKey: "psa_free", fieldType: FieldType.NUMBER, unit: "ng/mL", normalMin: 0, normalMax: 1.0, sortOrder: 2 },
    { label: "Percentage Free PSA", fieldKey: "psa_percent_free", fieldType: FieldType.NUMBER, unit: "%", normalMin: 24, normalMax: 100, referenceNote: "Normal cutoff >=24%.", sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "PROSTATE SPECIFIC ANTIGEN (FREE)": [
    { label: "Free PSA", fieldKey: "psa_free", fieldType: FieldType.NUMBER, unit: "ng/mL", normalMin: 0, normalMax: 1.0, sortOrder: 1 },
    { label: "Percentage Free PSA", fieldKey: "psa_percent_free", fieldType: FieldType.NUMBER, unit: "%", normalMin: 24, normalMax: 100, isRequired: false, referenceNote: "Normal cutoff >=24%.", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "CARCINOEMBRYONIC ANTIGEN (CEA)": [
    { label: "CEA", fieldKey: "cea", fieldType: FieldType.NUMBER, unit: "ng/mL", normalMin: 0, normalMax: 5.0, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ALPHA-FETOPROTEIN (AFP)": [
    { label: "AFP", fieldKey: "afp", fieldType: FieldType.NUMBER, unit: "ng/mL", normalMin: 0, normalMax: 10.0, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CA-125 TEST": [
    { label: "CA-125", fieldKey: "ca125", fieldType: FieldType.NUMBER, unit: "U/mL", normalMin: 0, normalMax: 35, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CA 19-9": [
    { label: "CA 19-9", fieldKey: "ca19_9", fieldType: FieldType.NUMBER, unit: "U/mL", normalMin: 0, normalMax: 37, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CD4 T CELL COUNT": [
    { label: "CD4 Count", fieldKey: "cd4_count", fieldType: FieldType.NUMBER, unit: "cells/ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂµL", normalMin: 500, normalMax: 1500, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CD4 T CELL PERCENTAGE": [
    { label: "CD4 Percentage", fieldKey: "cd4_percent", fieldType: FieldType.NUMBER, unit: "%", normalMin: 25, normalMax: 65, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CD8 T CELL COUNT": [
    { label: "CD8 Count", fieldKey: "cd8_count", fieldType: FieldType.NUMBER, unit: "cells/ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂµL", normalMin: 150, normalMax: 1000, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HIV 1 & II CONFIRMATORY TEST": [
    { label: "Screening Assay", fieldKey: "screening_assay", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Confirmatory Assay", fieldKey: "confirmatory_assay", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Indeterminate", sortOrder: 2 },
    { label: "Final Interpretation", fieldKey: "interpretation", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "HUMAN CHORIONIC GONADOTROPIN (B-HCG)": [
    { label: "Beta hCG", fieldKey: "beta_hcg", fieldType: FieldType.NUMBER, unit: "mIU/mL", normalMin: 0, normalMax: 5, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "PROGESTERONE": [
    { label: "Progesterone", fieldKey: "progesterone", fieldType: FieldType.NUMBER, unit: "ng/mL", sortOrder: 1 },
    { label: "Phase / Context", fieldKey: "phase", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "FOLLICLE STIMULATING HORMONE (FSH)": [
    { label: "FSH", fieldKey: "fsh", fieldType: FieldType.NUMBER, unit: "IU/L", normalMin: 1, normalMax: 9, sortOrder: 1 },
    { label: "Sex / Cycle Phase", fieldKey: "sex_phase", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "LUTEINIZING HORMONE (LH)": [
    { label: "LH", fieldKey: "lh", fieldType: FieldType.NUMBER, unit: "IU/L", normalMin: 1, normalMax: 9, sortOrder: 1 },
    { label: "Sex / Cycle Phase", fieldKey: "sex_phase", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "PROLACTIN": [
    { label: "Prolactin", fieldKey: "prolactin", fieldType: FieldType.NUMBER, unit: "mIU/L", normalMin: 41, normalMax: 520, sortOrder: 1 },
    { label: "Sex", fieldKey: "sex", fieldType: FieldType.DROPDOWN, options: "Male,Female", isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HORMONAL IMMUNOASSAY PANEL": [
    { label: "FSH", fieldKey: "fsh", fieldType: FieldType.NUMBER, unit: "IU/L", isRequired: false, sortOrder: 1 },
    { label: "LH", fieldKey: "lh", fieldType: FieldType.NUMBER, unit: "IU/L", isRequired: false, sortOrder: 2 },
    { label: "Prolactin", fieldKey: "prolactin", fieldType: FieldType.NUMBER, unit: "ng/mL", isRequired: false, sortOrder: 3 },
    { label: "Estradiol (E2)", fieldKey: "estradiol", fieldType: FieldType.NUMBER, unit: "pg/mL", isRequired: false, sortOrder: 4 },
    { label: "Progesterone", fieldKey: "progesterone", fieldType: FieldType.NUMBER, unit: "ng/mL", isRequired: false, sortOrder: 5 },
    { label: "Total Testosterone", fieldKey: "testosterone", fieldType: FieldType.NUMBER, unit: "ng/dL", isRequired: false, sortOrder: 6 },
    { label: "Beta hCG", fieldKey: "beta_hcg", fieldType: FieldType.NUMBER, unit: "mIU/mL", isRequired: false, sortOrder: 7 },
    { label: "Cycle Day / Clinical Context", fieldKey: "clinical_context", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 8 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 9 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 10 },
  ],
  "ANTI-MULLERIAN HORMONE (AMH)": [
    { label: "AMH", fieldKey: "amh", fieldType: FieldType.NUMBER, unit: "ng/mL", sortOrder: 1 },
    { label: "Reference Group", fieldKey: "reference_group", fieldType: FieldType.DROPDOWN, options: "Female reproductive age,Female peri-menopause,Female post-menopause,Male", isRequired: false, sortOrder: 2 },
    { label: "Ovarian Reserve Comment", fieldKey: "ovarian_reserve_comment", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "OESTROGEN (E2)": [
    { label: "Estradiol (E2)", fieldKey: "estradiol", fieldType: FieldType.NUMBER, unit: "pmol/L", sortOrder: 1 },
    { label: "Cycle Phase / Sex", fieldKey: "phase", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "VITAMIN B12": [
    { label: "Vitamin B12", fieldKey: "vitamin_b12", fieldType: FieldType.NUMBER, unit: "pg/mL", normalMin: 160, normalMax: 950, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "VITAMIN D": [
    { label: "Vitamin D (25-OH)", fieldKey: "vitamin_d", fieldType: FieldType.NUMBER, unit: "ng/mL", normalMin: 30, normalMax: 100, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "FERRITIN": [
    { label: "Ferritin", fieldKey: "ferritin", fieldType: FieldType.NUMBER, unit: "ng/mL", sortOrder: 1 },
    { label: "Sex", fieldKey: "sex", fieldType: FieldType.DROPDOWN, options: "Male,Female", isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "SERUM IRON": [
    { label: "Serum Iron", fieldKey: "serum_iron", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L", normalMin: 9, normalMax: 30, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "TOTAL IRON BINDING CAPACITY (TIBC)": [
    { label: "TIBC", fieldKey: "tibc", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµmol/L", normalMin: 45, normalMax: 72, sortOrder: 1 },
    { label: "Transferrin Saturation", fieldKey: "transferrin_sat", fieldType: FieldType.NUMBER, unit: "%", normalMin: 20, normalMax: 55, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "PARATHYROID HORMONE (PTH)": [
    { label: "PTH", fieldKey: "pth", fieldType: FieldType.NUMBER, unit: "pg/mL", normalMin: 10, normalMax: 65, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "DEHYDROEPIANDROSTERONE SULFATE (DHEA-S)": [
    { label: "DHEA-S", fieldKey: "dhea_s", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµg/dL", sortOrder: 1 },
    { label: "Sex / Age Group", fieldKey: "sex_age_group", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "CORTISOL": [
    { label: "Cortisol", fieldKey: "cortisol", fieldType: FieldType.NUMBER, unit: "nmol/L", sortOrder: 1 },
    { label: "Collection Time", fieldKey: "collection_time", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "TESTOSTERONE": [
    { label: "Total Testosterone", fieldKey: "testosterone", fieldType: FieldType.NUMBER, unit: "ng/dL", sortOrder: 1 },
    { label: "Sex", fieldKey: "sex", fieldType: FieldType.DROPDOWN, options: "Male,Female", isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "MICROALBUMIN": [
    { label: "Urine Albumin", fieldKey: "microalbumin", fieldType: FieldType.NUMBER, unit: "mg/L", normalMin: 0, normalMax: 20, sortOrder: 1 },
    { label: "Albumin/Creatinine Ratio", fieldKey: "acr", fieldType: FieldType.NUMBER, unit: "mg/g", normalMin: 0, normalMax: 30, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "ADRENOCORTICOTROPIC HORMONE (ACTH)": [
    { label: "ACTH", fieldKey: "acth", fieldType: FieldType.NUMBER, unit: "pg/mL", normalMin: 10, normalMax: 60, sortOrder: 1 },
    { label: "Collection Time", fieldKey: "collection_time", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HBsAg-QUANTITATIVE": [
    { label: "HBsAg Quantitative", fieldKey: "hbsag_quant", fieldType: FieldType.NUMBER, unit: "IU/mL", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HUMAN GROWTH HORMONE": [
    { label: "Growth Hormone", fieldKey: "growth_hormone", fieldType: FieldType.NUMBER, unit: "ng/mL", sortOrder: 1 },
    { label: "Interpretation Note", fieldKey: "interpretation_note", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ANTI NUCLEAR ANTIBODY (ANA)": [
    { label: "ANA Result", fieldKey: "ana_result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Borderline", sortOrder: 1 },
    { label: "Titre", fieldKey: "titre", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Pattern", fieldKey: "pattern", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "DOUBLE STRANDED DNA TEST (ds-DNA)": [
    { label: "dsDNA", fieldKey: "dsdna", fieldType: FieldType.NUMBER, unit: "IU/mL", normalMin: 0, normalMax: 30, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "BRAIN NATRIURETIC PEPTIDE (NT-proBNP)": [
    { label: "NT-proBNP", fieldKey: "ntprobnp", fieldType: FieldType.NUMBER, unit: "pg/mL", normalMin: 0, normalMax: 300, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CK-MB": [
    { label: "CK-MB", fieldKey: "ck_mb", fieldType: FieldType.NUMBER, unit: "ng/mL", normalMin: 0, normalMax: 5, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "TROPONIN T": [
    { label: "Troponin T", fieldKey: "troponin_t", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµg/L", normalMin: 0, normalMax: 0.1, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "TROPONIN I": [
    { label: "Troponin I", fieldKey: "troponin_i", fieldType: FieldType.NUMBER, unit: "ng/L", normalMin: 0, normalMax: 45, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBV 5 PANEL TEST": [
    { label: "HBsAg", fieldKey: "hbsag", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "HBsAb", fieldKey: "hbsab", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 2 },
    { label: "HBeAg", fieldKey: "hbeag", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 3 },
    { label: "HBeAb", fieldKey: "hbeab", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 4 },
    { label: "HBcAb", fieldKey: "hbcab", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "HBsAb-QUANTITATIVE": [
    { label: "HBsAb Quantitative", fieldKey: "hbsab_quant", fieldType: FieldType.NUMBER, unit: "mIU/mL", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBeAg-QUANTITATIVE": [
    { label: "HBeAg Quantitative", fieldKey: "hbeag_quant", fieldType: FieldType.NUMBER, unit: "PEI U/mL", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBeAb-QUANTITATIVE": [
    { label: "HBeAb Quantitative", fieldKey: "hbeab_quant", fieldType: FieldType.NUMBER, unit: "PEI U/mL", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBcAb-QUANTITATIVE": [
    { label: "HBcAb Quantitative", fieldKey: "hbcab_quant", fieldType: FieldType.NUMBER, unit: "PEI U/mL", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBV DNA PANEL": [
    { label: "HBV DNA Viral Load", fieldKey: "hbv_dna", fieldType: FieldType.NUMBER, unit: "IU/mL", sortOrder: 1 },
    { label: "Log10 Viral Load", fieldKey: "hbv_dna_log", fieldType: FieldType.NUMBER, unit: "log10 IU/mL", isRequired: false, sortOrder: 2 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HBsAg-QUALITATIVE": [
    { label: "HBsAg", fieldKey: "hbsag", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBsAb-QUALITATIVE": [
    { label: "HBsAb", fieldKey: "hbsab", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBeAg-QUALITATIVE": [
    { label: "HBeAg", fieldKey: "hbeag", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBeAb-QUALITATIVE": [
    { label: "HBeAb", fieldKey: "hbeab", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HBcAb-QUALITATIVE": [
    { label: "HBcAb", fieldKey: "hbcab", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  // Semen Analysis ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â expanded with all docx fields
  "SEMEN ANALYSIS": [
    { label: "Time Produced", fieldKey: "time_produced", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 1 },
    { label: "Time Examined", fieldKey: "time_examined", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Days Abstained", fieldKey: "days_abstained", fieldType: FieldType.NUMBER, unit: "days", normalMin: 2, normalMax: 7, isRequired: false, sortOrder: 3 },
    { label: "Volume", fieldKey: "volume", fieldType: FieldType.NUMBER, unit: "mL", normalMin: 1.4, sortOrder: 4 },
    { label: "pH", fieldKey: "ph", fieldType: FieldType.NUMBER, unit: "pH", normalMin: 7.2, normalMax: 8.0, sortOrder: 5 },
    { label: "Appearance", fieldKey: "appearance", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 6 },
    { label: "Liquefaction Time", fieldKey: "liquefaction_time", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 7 },
    { label: "Sperm Count (Total)", fieldKey: "sperm_count", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â106", normalMin: 39, isRequired: false, sortOrder: 8 },
    { label: "Sperm Concentration", fieldKey: "sperm_concentration", fieldType: FieldType.NUMBER, unit: "million/mL", normalMin: 15, sortOrder: 9 },
    { label: "Progressively Motile", fieldKey: "progressive_motility", fieldType: FieldType.NUMBER, unit: "%", normalMin: 32, normalMax: 100, sortOrder: 10 },
    { label: "Non-Progressively Motile", fieldKey: "non_progressive_motility", fieldType: FieldType.NUMBER, unit: "%", isRequired: false, sortOrder: 11 },
    { label: "Non-Motile", fieldKey: "non_motile", fieldType: FieldType.NUMBER, unit: "%", isRequired: false, sortOrder: 12 },
    { label: "Total Motility", fieldKey: "motility", fieldType: FieldType.NUMBER, unit: "%", normalMin: 40, normalMax: 100, sortOrder: 13 },
    { label: "Morphology (Normal)", fieldKey: "morphology", fieldType: FieldType.NUMBER, unit: "%", normalMin: 4, normalMax: 100, isRequired: false, sortOrder: 14 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 15 },
  ],
  "BLOOD GROUP": [
    { label: "ABO Group", fieldKey: "abo_group", fieldType: FieldType.DROPDOWN, options: "A,B,AB,O", sortOrder: 1 },
    { label: "Rh Type", fieldKey: "rh_type", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "GENOTYPE": [
    { label: "Genotype", fieldKey: "genotype", fieldType: FieldType.DROPDOWN, options: "AA,AS,AC,SS,SC,CC", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "DIRECT COOMBS TEST": [
    { label: "Direct Coombs Result", fieldKey: "direct_coombs", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "INDIRECT COOMBS TEST": [
    { label: "Indirect Coombs Result", fieldKey: "indirect_coombs", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CROSS MATCHING": [
    { label: "Donor Unit Number", fieldKey: "donor_unit", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 1 },
    { label: "Crossmatch Result", fieldKey: "crossmatch_result", fieldType: FieldType.DROPDOWN, options: "Compatible,Incompatible", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HB ELECTROPHORESIS": [
    { label: "HbA", fieldKey: "hb_a", fieldType: FieldType.NUMBER, unit: "%", normalMin: 95, normalMax: 99, isRequired: false, sortOrder: 1 },
    { label: "HbA2", fieldKey: "hb_a2", fieldType: FieldType.NUMBER, unit: "%", normalMin: 2, normalMax: 3.5, isRequired: false, sortOrder: 2 },
    { label: "HbF", fieldKey: "hb_f", fieldType: FieldType.NUMBER, unit: "%", normalMin: 0, normalMax: 1, isRequired: false, sortOrder: 3 },
    { label: "Pattern", fieldKey: "pattern", fieldType: FieldType.TEXTAREA, sortOrder: 4 },
  ],
  "GENOTYPING (CONFIRMATORY)": [
    { label: "Confirmed Genotype", fieldKey: "confirmed_genotype", fieldType: FieldType.DROPDOWN, options: "AA,AS,AC,SS,SC,CC", sortOrder: 1 },
    { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "PROTHROMBIN TIME": [
    { label: "PT", fieldKey: "pt", fieldType: FieldType.NUMBER, unit: "seconds", normalMin: 11, normalMax: 13.5, sortOrder: 1 },
    { label: "INR", fieldKey: "inr", fieldType: FieldType.NUMBER, unit: "ratio", normalMin: 0.8, normalMax: 1.1, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "APTT": [
    { label: "aPTT", fieldKey: "aptt", fieldType: FieldType.NUMBER, unit: "seconds", normalMin: 25, normalMax: 35, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "FIBRINOGEN": [
    { label: "Fibrinogen", fieldKey: "fibrinogen", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 200, normalMax: 400, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ESR": [
    { label: "ESR", fieldKey: "esr", fieldType: FieldType.NUMBER, unit: "mm/hr", normalMin: 0, normalMax: 20, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HAEMOGLOBIN (HB)": [
    { label: "Haemoglobin", fieldKey: "haemoglobin", fieldType: FieldType.NUMBER, unit: "g/dL", normalMin: 12, normalMax: 17, referenceNote: "Template style supports reporting as g/dL with optional percent equivalent, e.g. 12.6 g/dL (86%).", sortOrder: 1 },
    { label: "Haemoglobin (%)", fieldKey: "haemoglobin_percent", fieldType: FieldType.NUMBER, unit: "%", normalMin: 80, normalMax: 120, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HAEMATOCRIT (PCV)": [
    { label: "PCV / Haematocrit", fieldKey: "pcv", fieldType: FieldType.NUMBER, unit: "%", normalMin: 36, normalMax: 50, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "RETICULOCYTE COUNT": [
    { label: "Reticulocyte Count", fieldKey: "reticulocyte", fieldType: FieldType.NUMBER, unit: "%", normalMin: 0.5, normalMax: 2.5, sortOrder: 1 },
    { label: "Absolute Reticulocyte Count", fieldKey: "abs_reticulocyte", fieldType: FieldType.NUMBER, unit: "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â10?/L", normalMin: 25, normalMax: 100, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "PERIPHERAL BLOOD FILM": [
    { label: "Film Appearance", fieldKey: "film_appearance", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Red Cell Morphology", fieldKey: "rbc_morphology", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "WBC Differential Comment", fieldKey: "wbc_comment", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Platelet Comment", fieldKey: "platelet_comment", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
  ],
  "D-DIMER": [
    { label: "D-Dimer", fieldKey: "d_dimer", fieldType: FieldType.NUMBER, unit: "mg/L FEU", normalMin: 0, normalMax: 0.5, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "DNA PATERNITY TEST": [
    { label: "Result Summary", fieldKey: "result_summary", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Probability of Paternity", fieldKey: "probability", fieldType: FieldType.NUMBER, unit: "%", isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HBV DNA VIRAL LOAD": [
    { label: "HBV DNA Viral Load", fieldKey: "hbv_dna_viral_load", fieldType: FieldType.NUMBER, unit: "IU/mL", sortOrder: 1 },
    { label: "Log10 Viral Load", fieldKey: "hbv_dna_log", fieldType: FieldType.NUMBER, unit: "log10 IU/mL", isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HBV RNA BY RT-PCR": [
    { label: "HBV RNA", fieldKey: "hbv_rna", fieldType: FieldType.NUMBER, unit: "copies/mL", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HCV RNA VIRAL LOAD": [
    { label: "HCV RNA Viral Load", fieldKey: "hcv_rna_viral_load", fieldType: FieldType.NUMBER, unit: "IU/mL", sortOrder: 1 },
    { label: "Log10 Viral Load", fieldKey: "hcv_rna_log", fieldType: FieldType.NUMBER, unit: "log10 IU/mL", isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HCV GENOTYPING": [
    { label: "HCV Genotype", fieldKey: "hcv_genotype", fieldType: FieldType.TEXT, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "TUBERCULOSIS ANTIGEN TEST": [
    { label: "TB Antigen Result", fieldKey: "tb_antigen_result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Indeterminate", sortOrder: 1 },
    { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "HBV QUALITATIVE (CONFIRMATORY TEST)": [
    { label: "HBV Confirmatory Result", fieldKey: "hbv_confirm_result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Indeterminate", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HCV QUALITATIVE (CONFIRMATORY TEST)": [
    { label: "HCV Confirmatory Result", fieldKey: "hcv_confirm_result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Indeterminate", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HEPATITIS B SCREENING": [
    { label: "HBsAg Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HEPATITIS C SCREENING": [
    { label: "Anti-HCV Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "CHLAMYDIA": [
    { label: "Chlamydia Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 1 },
    { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "VDRL": [
    { label: "VDRL Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Titre", fieldKey: "titre", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "BRUCELLA SCREENING": [
    { label: "Brucella Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 1 },
    { label: "Titre", fieldKey: "titre", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "URINE M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "STOOL M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "SPUTUM M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "BLOOD CULTURE/SENSITIVITY": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "HIGH VAGINAL SWAB (HVS) M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "ENDOCERVICAL SWAB (ECS) M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "URETHRAL SWAB M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "SEMEN M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "SKIN/NAIL SCRAPING M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "OTHER SWABS/FLUID M/C/S": [
    { label: "Macroscopy", fieldKey: "macroscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 1 },
    { label: "Microscopy", fieldKey: "microscopy", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    { label: "Culture Result", fieldKey: "culture_result", fieldType: FieldType.DROPDOWN, options: "No Growth,Growth Present,Mixed Growth", sortOrder: 3 },
    { label: "Isolated Organism(s)", fieldKey: "organisms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Sensitivity Pattern", fieldKey: "sensitivity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
  ],
  "GRAM STAINING": [
    { label: "Gram Stain Result", fieldKey: "gram_stain_result", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "H. PYLORI SCREENING": [
    { label: "H. pylori Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 1 },
    { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "ASO TITRE": [
    { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ANTI-STREPTOLYSIN O (ASO) TITRE": [
    { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ANTI-CCP ANTIBODY": [
    { label: "Anti-CCP", fieldKey: "anti_ccp", fieldType: FieldType.NUMBER, unit: "U/mL", normalMin: 0, normalMax: 17, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ANTI-dsDNA ANTIBODY": [
    { label: "Anti-dsDNA", fieldKey: "anti_dsdna", fieldType: FieldType.NUMBER, unit: "IU/mL", normalMin: 0, normalMax: 30, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ANTI-TPO ANTIBODY": [
    { label: "Anti-TPO Antibody", fieldKey: "anti_tpo", fieldType: FieldType.NUMBER, unit: "IU/mL", normalMin: 0, normalMax: 34, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "ANTI-THYROGLOBULIN ANTIBODY": [
    { label: "Anti-Thyroglobulin Antibody", fieldKey: "anti_thyroglobulin", fieldType: FieldType.NUMBER, unit: "IU/mL", normalMin: 0, normalMax: 115, sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "RHEUMATOID FACTOR": [
    { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "HEPATITIS A SCREENING": [
    { label: "HAV Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "BLOOD FILM": [
    { label: "Film Findings", fieldKey: "film_findings", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "MALARIA PARASITES (MP)": [
    { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
    { label: "Species", fieldKey: "species", fieldType: FieldType.DROPDOWN, options: "Plasmodium falciparum,Plasmodium vivax,Plasmodium malariae,Mixed,Not Applicable", isRequired: false, sortOrder: 2 },
    { label: "Parasitaemia", fieldKey: "parasitaemia", fieldType: FieldType.DROPDOWN, options: "+,++,+++,++++,Not Applicable", isRequired: false, sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "HIV SCREENING": [
    { label: "Determine Result", fieldKey: "determine", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Unigold Result", fieldKey: "unigold", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive,Not Done", isRequired: false, sortOrder: 2 },
    { label: "Final Interpretation", fieldKey: "interpretation", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "MANTOUX TEST": [
    { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", normalText: "Negative", sortOrder: 1 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
  ],
  "SKIN SCRAPING ANALYSIS": [
    { label: "Microscopy Findings", fieldKey: "microscopy_findings", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Organism Seen", fieldKey: "organism_seen", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "SPUTUM AFB (X2)": [
    { label: "AFB Smear 1", fieldKey: "afb1", fieldType: FieldType.DROPDOWN, options: "Negative,Scanty,1+,2+,3+", sortOrder: 1 },
    { label: "AFB Smear 2", fieldKey: "afb2", fieldType: FieldType.DROPDOWN, options: "Negative,Scanty,1+,2+,3+", sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "FAECAL OCCULT BLOOD (FOB)": [
    { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Reactive,Non-Reactive", sortOrder: 1 },
    { label: "Method", fieldKey: "method", fieldType: FieldType.DROPDOWN, options: "Rapid Immunoassay,Guaiac-based", isRequired: false, sortOrder: 2 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
  ],
  "TYPHOID IGM/IGG RAPID TEST": [
    { label: "IgM Result", fieldKey: "igm_result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
    { label: "IgG Result", fieldKey: "igg_result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 2 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "DENGUE NS1 ANTIGEN": [
    { label: "NS1 Antigen", fieldKey: "ns1_antigen", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", sortOrder: 1 },
    { label: "Dengue IgM", fieldKey: "dengue_igm", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Not Done", isRequired: false, sortOrder: 2 },
    { label: "Dengue IgG", fieldKey: "dengue_igg", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Not Done", isRequired: false, sortOrder: 3 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
  ],
  "DRUG SCREEN (URINE)": [
    { label: "Cannabinoids (THC)", fieldKey: "thc", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", isRequired: false, sortOrder: 1 },
    { label: "Opiates", fieldKey: "opiates", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", isRequired: false, sortOrder: 2 },
    { label: "Cocaine", fieldKey: "cocaine", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", isRequired: false, sortOrder: 3 },
    { label: "Amphetamines", fieldKey: "amphetamines", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", isRequired: false, sortOrder: 4 },
    { label: "Benzodiazepines", fieldKey: "benzodiazepines", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", isRequired: false, sortOrder: 5 },
    { label: "Methamphetamine", fieldKey: "methamphetamine", fieldType: FieldType.DROPDOWN, options: "Positive,Negative", isRequired: false, sortOrder: 6 },
    { label: "Overall Interpretation", fieldKey: "overall", fieldType: FieldType.DROPDOWN, options: "Negative for all substances,Positive ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â see details", sortOrder: 7 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 8 },
  ],
};

  const RADIOLOGY_FIELD_LIBRARY: Record<string, SeedField[]> = {
  "ABDOMINAL SCAN": [
    { label: "Liver", fieldKey: "liver", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Gallbladder", fieldKey: "gallbladder", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Spleen", fieldKey: "spleen", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
    { label: "Pancreas", fieldKey: "pancreas", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Kidneys", fieldKey: "kidneys", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
    { label: "Urinary Bladder", fieldKey: "bladder", fieldType: FieldType.TEXTAREA, sortOrder: 6 },
    { label: "Free Fluid", fieldKey: "free_fluid", fieldType: FieldType.DROPDOWN, options: "None,Minimal,Moderate,Gross", isRequired: false, sortOrder: 7 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 8 },
  ],
  "PELVIC SCAN": [
    { label: "Uterus", fieldKey: "uterus", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Ovaries", fieldKey: "ovaries", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Endometrium", fieldKey: "endometrium", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Pouch of Douglas", fieldKey: "pod", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
  ],
  "OBSTETRIC/FETAL ULTRASOUND": [
    { label: "Gestational Age", fieldKey: "gestational_age", fieldType: FieldType.TEXT, sortOrder: 1 },
    { label: "Fetal Number", fieldKey: "fetal_number", fieldType: FieldType.DROPDOWN, options: "Singleton,Twins,Triplets", sortOrder: 2 },
    { label: "Presentation", fieldKey: "presentation", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 3 },
    { label: "Fetal Heart Rate", fieldKey: "fhr", fieldType: FieldType.NUMBER, unit: "bpm", normalMin: 110, normalMax: 160, sortOrder: 4 },
    { label: "Placenta", fieldKey: "placenta", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Liquor", fieldKey: "liquor", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 6 },
    { label: "Biometry", fieldKey: "biometry", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 7 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 8 },
  ],
  "BREAST SCAN": [
    { label: "Right Breast", fieldKey: "right_breast", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Left Breast", fieldKey: "left_breast", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Axillae", fieldKey: "axillae", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 4 },
  ],
  "OCCULAR SCAN": [
    { label: "Right Eye", fieldKey: "right_eye", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Left Eye", fieldKey: "left_eye", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
  ],
  "TRANSRECTAL/PROSTATE SCAN": [
    { label: "Prostate Volume", fieldKey: "prostate_volume", fieldType: FieldType.NUMBER, unit: "mL", normalMin: 15, normalMax: 30, isRequired: false, sortOrder: 1 },
    { label: "Prostate", fieldKey: "prostate", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Seminal Vesicles", fieldKey: "seminal_vesicles", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Bladder", fieldKey: "bladder", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
  ],
  "SCROTAL/TESTICULAR SCAN": [
    { label: "Right Testis", fieldKey: "right_testis", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Left Testis", fieldKey: "left_testis", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Epididymis", fieldKey: "epididymis", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Vascularity", fieldKey: "vascularity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
  ],
  "THYROID SCAN": [
    { label: "Right Lobe", fieldKey: "right_lobe", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Left Lobe", fieldKey: "left_lobe", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Isthmus", fieldKey: "isthmus", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Nodules", fieldKey: "nodules", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Vascularity", fieldKey: "vascularity", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 6 },
  ],
  "RENAL SCAN": [
    { label: "Right Kidney", fieldKey: "right_kidney", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Left Kidney", fieldKey: "left_kidney", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Urinary Bladder", fieldKey: "bladder", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 4 },
  ],
  "NECK SCAN": [
    { label: "Lymph Nodes", fieldKey: "lymph_nodes", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Soft Tissue Findings", fieldKey: "soft_tissue", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
  ],
  "LIVER/GALLBLADDER SCAN": [
    { label: "Liver", fieldKey: "liver", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Gallbladder", fieldKey: "gallbladder", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Common Bile Duct", fieldKey: "cbd", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 4 },
  ],
  "FOLLICULOMETRY (FOLLICULAR TRACKING)": [
    { label: "Day of Cycle", fieldKey: "day_of_cycle", fieldType: FieldType.TEXT, sortOrder: 1 },
    { label: "Right Ovary", fieldKey: "right_ovary", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Left Ovary", fieldKey: "left_ovary", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
    { label: "Endometrium", fieldKey: "endometrium", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
  ],
  "SONO-HSG": [
    { label: "Uterus", fieldKey: "uterus", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Right Tube", fieldKey: "right_tube", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Left Tube", fieldKey: "left_tube", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
    { label: "Spillage", fieldKey: "spillage", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
  ],
  "ECHOCARDIOGRAM": [
    { label: "Cardiac Chambers", fieldKey: "chambers", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Valves", fieldKey: "valves", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Ejection Fraction", fieldKey: "ejection_fraction", fieldType: FieldType.NUMBER, unit: "%", normalMin: 50, normalMax: 70, isRequired: false, sortOrder: 3 },
    { label: "Pericardium", fieldKey: "pericardium", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
  ],
  "DOPPLER STUDY": [
    { label: "Vessel / Region", fieldKey: "vessel_region", fieldType: FieldType.TEXT, sortOrder: 1 },
    { label: "Spectral / Flow Findings", fieldKey: "flow_findings", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
  ],
  "MAMMOGRAPHY": [
    { label: "Breast Density", fieldKey: "breast_density", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 1 },
    { label: "Right Breast", fieldKey: "right_breast", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Left Breast", fieldKey: "left_breast", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
    { label: "BI-RADS", fieldKey: "birads", fieldType: FieldType.DROPDOWN, options: "0,1,2,3,4,5,6", isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
  ],
  "REST ECG": [
    { label: "Rhythm", fieldKey: "rhythm", fieldType: FieldType.TEXT, sortOrder: 1 },
    { label: "Rate", fieldKey: "rate", fieldType: FieldType.NUMBER, unit: "bpm", normalMin: 60, normalMax: 100, sortOrder: 2 },
    { label: "Axis", fieldKey: "axis", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 3 },
    { label: "Intervals", fieldKey: "intervals", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "ST-T Changes", fieldKey: "st_t_changes", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 6 },
  ],
  "STRESS ECG": [
    { label: "Protocol", fieldKey: "protocol", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 1 },
    { label: "Rhythm", fieldKey: "rhythm", fieldType: FieldType.TEXT, sortOrder: 2 },
    { label: "Max Heart Rate", fieldKey: "max_heart_rate", fieldType: FieldType.NUMBER, unit: "bpm", isRequired: false, sortOrder: 3 },
    { label: "ST Changes", fieldKey: "st_changes", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Symptoms", fieldKey: "symptoms", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 6 },
  ],
  "AMBULATORY ECG (HOLTER)": [
    { label: "Duration", fieldKey: "duration", fieldType: FieldType.TEXT, sortOrder: 1 },
    { label: "Underlying Rhythm", fieldKey: "underlying_rhythm", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Arrhythmias", fieldKey: "arrhythmias", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Heart Rate Summary", fieldKey: "heart_rate_summary", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
  ],
  "UPPER GI ENDOSCOPY": [
    { label: "Esophagus", fieldKey: "esophagus", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Stomach", fieldKey: "stomach", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Duodenum", fieldKey: "duodenum", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 4 },
  ],
  "SIGMOIDOSCOPY/COLONOSCOPY": [
    { label: "Preparation", fieldKey: "preparation", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 1 },
    { label: "Findings", fieldKey: "findings", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
    { label: "Biopsy Taken", fieldKey: "biopsy_taken", fieldType: FieldType.DROPDOWN, options: "Yes,No", isRequired: false, sortOrder: 3 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 4 },
  ],
  "PROCTOSCOPY": [
    { label: "Findings", fieldKey: "findings", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
    { label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
  ],
  "ORAL GLUCOSE TOLERANCE TEST (OGTT)": [
    { label: "Fasting Glucose", fieldKey: "glucose_fasting", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.9, normalMax: 5.6, referenceNote: "Normal: <5.6 mmol/L; Diabetes: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥7.0 mmol/L", sortOrder: 1 },
    { label: "Fasting Glucose (mg/dL)", fieldKey: "glucose_fasting_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 70, normalMax: 100, isRequired: false, sortOrder: 2 },
    { label: "1 Hour Glucose", fieldKey: "glucose_1hr", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.9, normalMax: 8.9, sortOrder: 3 },
    { label: "1 Hour Glucose (mg/dL)", fieldKey: "glucose_1hr_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 70, normalMax: 160, isRequired: false, sortOrder: 4 },
    { label: "2 Hour Glucose", fieldKey: "glucose_2hr", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.9, normalMax: 7.8, sortOrder: 5 },
    { label: "2 Hour Glucose (mg/dL)", fieldKey: "glucose_2hr_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 70, normalMax: 140, isRequired: false, sortOrder: 6 },
    { label: "3 Hour Glucose", fieldKey: "glucose_3hr", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.9, normalMax: 7.8, isRequired: false, sortOrder: 7 },
    { label: "3 Hour Glucose (mg/dL)", fieldKey: "glucose_3hr_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 70, normalMax: 140, isRequired: false, sortOrder: 8 },
    { label: "Glucose Load", fieldKey: "glucose_load", fieldType: FieldType.DROPDOWN, options: "75g,100g (Pregnancy)", isRequired: false, sortOrder: 9 },
    { label: "Interpretation", fieldKey: "interpretation", fieldType: FieldType.DROPDOWN, options: "Normal,Impaired Fasting Glucose,Impaired Glucose Tolerance,Diabetes Mellitus,Gestational Diabetes Mellitus", isRequired: false, sortOrder: 10 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 11 },
  ],
  "GESTATIONAL OGTT (100g)": [
    { label: "Fasting Glucose", fieldKey: "glucose_fasting", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.3, normalMax: 5.3, referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥5.3 mmol/L (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥95 mg/dL)", sortOrder: 1 },
    { label: "Fasting Glucose (mg/dL)", fieldKey: "glucose_fasting_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 59, normalMax: 95, isRequired: false, sortOrder: 2 },
    { label: "1 Hour Glucose", fieldKey: "glucose_1hr", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.3, normalMax: 10.0, referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥10.0 mmol/L (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥180 mg/dL)", sortOrder: 3 },
    { label: "1 Hour Glucose (mg/dL)", fieldKey: "glucose_1hr_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 59, normalMax: 180, isRequired: false, sortOrder: 4 },
    { label: "2 Hour Glucose", fieldKey: "glucose_2hr", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.3, normalMax: 8.6, referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥8.6 mmol/L (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥155 mg/dL)", sortOrder: 5 },
    { label: "2 Hour Glucose (mg/dL)", fieldKey: "glucose_2hr_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 59, normalMax: 155, isRequired: false, sortOrder: 6 },
    { label: "3 Hour Glucose", fieldKey: "glucose_3hr", fieldType: FieldType.NUMBER, unit: "mmol/L", normalMin: 3.3, normalMax: 7.8, referenceNote: "Abnormal if ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥7.8 mmol/L (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥140 mg/dL)", sortOrder: 7 },
    { label: "3 Hour Glucose (mg/dL)", fieldKey: "glucose_3hr_mg_dl", fieldType: FieldType.NUMBER, unit: "mg/dL", normalMin: 59, normalMax: 140, isRequired: false, sortOrder: 8 },
    { label: "GDM Diagnosis", fieldKey: "gdm_diagnosis", fieldType: FieldType.DROPDOWN, options: "Not Diagnosed,Diagnosed (2 or more values abnormal)", isRequired: false, sortOrder: 9 },
    { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 10 },
  ],
};

  function inferMainUnit(testName: string) {
    const mapped = LAB_FIELD_LIBRARY[testName];
    if (mapped && mapped[0]?.unit) return mapped[0].unit ?? "";
    const n = testName.toLowerCase();
    if (n.includes("viral load")) return "IU/mL";
    if (n.includes("dna") || n.includes("rna")) return "copies/mL";
    if (n.includes("culture") || n.includes("screening") || n.includes("analysis")) return "";
    return "";
  }

  function buildLabMainFields(testName: string) {
    if (isCultureTest(testName)) {
      return makeCultureFields();
    }

    if (orgId === HOLY_SOULS_ORGANIZATION_ID) {
      const override = getHolySoulsOverride(testName);
      if (override) return override;
    }

    const mapped = LAB_FIELD_LIBRARY[testName];
    if (mapped) return mapped;

    const n = testName.toLowerCase();
    if (n.includes("screening") || n.includes("qualitative") || n.includes("confirmatory")) {
      return [
        { label: "Result", fieldKey: "result", fieldType: FieldType.DROPDOWN, options: "Positive,Negative,Inconclusive", normalText: "Negative", sortOrder: 1 },
        { label: "Method", fieldKey: "method", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
        { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
      ];
    }

    const key = testName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);

    return [
      { label: testName, fieldKey: key || "result_value", fieldType: FieldType.TEXT, sortOrder: 1 },
      { label: "Comments", fieldKey: "comments", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 2 },
    ];
  }

  function withCoreRadiologySections(fields: SeedField[]) {
    const keys = new Set(fields.map((field) => field.fieldKey.toLowerCase()));
    let nextSort = fields.length > 0 ? Math.max(...fields.map((field) => field.sortOrder)) + 1 : 1;
    const merged = [...fields];
    if (!keys.has("findings")) {
      merged.push({ label: "Findings", fieldKey: "findings", fieldType: FieldType.TEXTAREA, sortOrder: nextSort++ });
    }
    if (!keys.has("impression")) {
      merged.push({ label: "Impression", fieldKey: "impression", fieldType: FieldType.TEXTAREA, sortOrder: nextSort++ });
    }
    if (!keys.has("recommendation")) {
      merged.push({
        label: "Recommendation",
        fieldKey: "recommendation",
        fieldType: FieldType.TEXTAREA,
        isRequired: false,
        sortOrder: nextSort++,
      });
    }
    return merged;
  }

  function inferRadiologyFieldTemplate(testName: string): SeedField[] {
    const n = normalizeName(testName).toUpperCase();

    if (n.includes("MAMMO")) {
      return [
        { label: "Technique", fieldKey: "technique", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
        { label: "Breast Density", fieldKey: "breast_density", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
        { label: "Right Breast", fieldKey: "right_breast", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
        { label: "Left Breast", fieldKey: "left_breast", fieldType: FieldType.TEXTAREA, sortOrder: 4 },
        { label: "Axillae", fieldKey: "axillae", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
        { label: "BI-RADS", fieldKey: "birads", fieldType: FieldType.DROPDOWN, options: "0,1,2,3,4,5,6", isRequired: false, sortOrder: 6 },
      ];
    }

    if (n.includes("TVS") || n.includes("TRANSVAGINAL") || n.includes("PELVIC ULTRASOUND")) {
      return [
        { label: "Technique", fieldKey: "technique", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
        { label: "Uterus", fieldKey: "uterus", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
        { label: "Endometrium", fieldKey: "endometrium", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 3 },
        { label: "Right Ovary", fieldKey: "right_ovary", fieldType: FieldType.TEXTAREA, sortOrder: 4 },
        { label: "Left Ovary", fieldKey: "left_ovary", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
        { label: "Adnexa", fieldKey: "adnexa", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
        { label: "Pouch of Douglas", fieldKey: "pouch_of_douglas", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 7 },
      ];
    }

    if (n.includes("OBSTETRIC") || n.includes("ANOMALY") || n.includes("NT SCAN") || n.includes("GROWTH SCAN") || n.includes("BPP")) {
      return [
        { label: "Technique", fieldKey: "technique", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
        { label: "Gestational Age", fieldKey: "gestational_age", fieldType: FieldType.TEXT, sortOrder: 2 },
        { label: "Fetal Number", fieldKey: "fetal_number", fieldType: FieldType.DROPDOWN, options: "Singleton,Twins,Triplets", sortOrder: 3 },
        { label: "Presentation", fieldKey: "presentation", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 4 },
        { label: "Fetal Heart Rate", fieldKey: "fetal_heart_rate", fieldType: FieldType.NUMBER, unit: "bpm", isRequired: false, sortOrder: 5 },
        { label: "Placenta", fieldKey: "placenta", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
        { label: "Liquor / AFI", fieldKey: "liquor_afi", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 7 },
        { label: "Biometry", fieldKey: "biometry", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 8 },
      ];
    }

    if (n.includes("DOPPLER")) {
      return [
        { label: "Technique", fieldKey: "technique", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
        { label: "Vessel / Region", fieldKey: "vessel_region", fieldType: FieldType.TEXT, sortOrder: 2 },
        { label: "Peak Systolic Velocity", fieldKey: "peak_systolic_velocity", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 3 },
        { label: "End Diastolic Velocity", fieldKey: "end_diastolic_velocity", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 4 },
        { label: "Spectral / Flow Findings", fieldKey: "flow_findings", fieldType: FieldType.TEXTAREA, sortOrder: 5 },
        { label: "Stenosis Grade", fieldKey: "stenosis_grade", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 6 },
      ];
    }

    if (n.includes("ECHO")) {
      return [
        { label: "Technique", fieldKey: "technique", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
        { label: "Cardiac Chambers", fieldKey: "cardiac_chambers", fieldType: FieldType.TEXTAREA, sortOrder: 2 },
        { label: "Valvular Findings", fieldKey: "valvular_findings", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
        { label: "Ejection Fraction", fieldKey: "ejection_fraction", fieldType: FieldType.NUMBER, unit: "%", isRequired: false, sortOrder: 4 },
        { label: "Wall Motion", fieldKey: "wall_motion", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 5 },
        { label: "Pericardium", fieldKey: "pericardium", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
      ];
    }

    if (n.includes("ECG") || n.includes("HOLTER") || n.includes("TREADMILL") || n.includes("STRESS")) {
      return [
        { label: "Heart Rate", fieldKey: "heart_rate", fieldType: FieldType.TEXT, sortOrder: 1 },
        { label: "Rhythm", fieldKey: "rhythm", fieldType: FieldType.TEXT, sortOrder: 2 },
        { label: "Intervals", fieldKey: "intervals", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 3 },
        { label: "Axis", fieldKey: "axis", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 4 },
      ];
    }

    if (n.includes("ENDOSCOPY") || n.includes("OGD") || n.includes("COLONOSCOPY") || n.includes("SIGMOIDOSCOPY") || n.includes("ERCP") || n.includes("EUS")) {
      return [
        { label: "Procedure", fieldKey: "procedure", fieldType: FieldType.TEXT, sortOrder: 1 },
        { label: "Extent Reached", fieldKey: "extent_reached", fieldType: FieldType.TEXT, isRequired: false, sortOrder: 2 },
        { label: "Segment Findings", fieldKey: "segment_findings", fieldType: FieldType.TEXTAREA, sortOrder: 3 },
        { label: "Interventions", fieldKey: "interventions", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 4 },
        { label: "Biopsy Taken", fieldKey: "biopsy_taken", fieldType: FieldType.DROPDOWN, options: "Yes,No", isRequired: false, sortOrder: 5 },
        { label: "Complications", fieldKey: "complications", fieldType: FieldType.TEXTAREA, isRequired: false, sortOrder: 6 },
      ];
    }

    if (n.includes("CT") || n.includes("MRI") || n.includes("X-RAY") || n.includes("XRAY")) {
      return [
        { label: "Technique", fieldKey: "technique", fieldType: FieldType.TEXTAREA, sortOrder: 1 },
      ];
    }

    return makeRadiologyWorkflowFields();
  }

  function buildRadiologyMainFields(testName: string) {
    const mapped = RADIOLOGY_FIELD_LIBRARY[testName];
    if (mapped) return withCoreRadiologySections(mapped);
    return withCoreRadiologySections(inferRadiologyFieldTemplate(testName));
  }

  // Refresh templates for already-existing standard lab tests
  // (e.g., older auto-generated LB*** records like Lipid Profile).
  const existingLabTestsForTemplateSync = await prisma.diagnosticTest.findMany({
    where: { organizationId: orgId, type: TestType.LAB },
    select: { id: true, name: true },
  });

  let syncedLabTemplateCount = 0;
  for (const test of existingLabTestsForTemplateSync) {
    const key = normalizeName(test.name).toUpperCase();
    const mapped = LAB_FIELD_LIBRARY[key];
    const override = orgId === HOLY_SOULS_ORGANIZATION_ID ? getHolySoulsOverride(test.name) : null;
    const effectiveFields = override ?? mapped;
    if (!effectiveFields) continue;

    const enriched = withReferenceMetadata(key, TestType.LAB, effectiveFields);
    await replaceResultTemplateFields(
      test.id,
      mapTemplateFields(test.id, enriched),
      `existingLabTemplateSync:${test.name}`
    );
    syncedLabTemplateCount += 1;
  }

  const legacyCardiologyTemplateLibrary: Record<string, SeedField[]> = {
    "REST ECG": makeEcgWorkflowFields(),
    "STRESS ECG": makeEcgWorkflowFields(),
    "AMBULATORY ECG (HOLTER)": makeEcgWorkflowFields(),
    ECHOCARDIOGRAM: makeRadiologyWorkflowFields(),
    "DOPPLER STUDY": makeRadiologyWorkflowFields(),
  };
  const legacyCardiologyLookup = new Map(
    Object.entries(legacyCardiologyTemplateLibrary).map(([name, fields]) => [normalizeName(name).toUpperCase(), fields])
  );
  const existingRadiologyForCardiologySync = await prisma.diagnosticTest.findMany({
    where: { organizationId: orgId, type: TestType.RADIOLOGY },
    select: { id: true, name: true },
  });
  let migratedLegacyCardiologyCount = 0;
  for (const test of existingRadiologyForCardiologySync) {
    const normalized = normalizeName(test.name).toUpperCase();
    const fields = legacyCardiologyLookup.get(normalized);
    if (!fields) continue;

    const enriched = withReferenceMetadata(test.name, TestType.RADIOLOGY, fields);
    await prisma.diagnosticTest.update({
      where: { id: test.id },
      data: { categoryId: "cat-cardiology", department: Department.RADIOLOGY, isActive: true },
    });
    await replaceResultTemplateFields(
      test.id,
      mapTemplateFields(test.id, enriched),
      `legacyCardiologyMigration:${test.name}`
    );
    migratedLegacyCardiologyCount += 1;
  }


  const existingLabNames = new Set(
    (
      await prisma.diagnosticTest.findMany({
        where: { organizationId: orgId, type: TestType.LAB },
        select: { name: true },
      })
    ).map((test) => normalizeName(test.name).toUpperCase())
  );

  const existingRadiologyNames = new Set(
    (
      await prisma.diagnosticTest.findMany({
        where: { organizationId: orgId, type: TestType.RADIOLOGY },
        select: { name: true },
      })
    ).map((test) => normalizeName(test.name).toUpperCase())
  );

  const dedupedLab = Array.from(
    new Set(rawLabTests.map(normalizeName).filter(Boolean))
  ).filter((name) => !existingLabNames.has(name.toUpperCase()));

  const dedupedRadiology = Array.from(
    new Set(rawRadiologyTests.map(normalizeName).filter(Boolean))
  ).filter((name) => !existingRadiologyNames.has(name.toUpperCase()));

  for (let i = 0; i < dedupedLab.length; i += 1) {
    const testName = dedupedLab[i];
    const normalized = testName.toUpperCase();
    if (existingLabNames.has(normalized)) continue;
    const code = generateCode("LB", testName, i);
    await seedTest({
      code,
      name: testName,
      type: TestType.LAB,
      department: Department.LABORATORY,
      categoryId: inferLabCategory(testName),
      price: 5000,
      turnaroundMinutes: 180,
      sampleType: "Lab Sample",
      description: "Added from expanded catalog list",
      fields: buildLabMainFields(testName),
    });
    existingLabNames.add(normalized);
  }

  for (let i = 0; i < dedupedRadiology.length; i += 1) {
    const testName = dedupedRadiology[i];
    const normalized = testName.toUpperCase();
    if (existingRadiologyNames.has(normalized)) continue;
    const code = generateCode("RD", testName, i);
    await seedTest({
      code,
      name: testName,
      type: TestType.RADIOLOGY,
      department: Department.RADIOLOGY,
      categoryId: "cat-imaging",
      price: 12000,
      turnaroundMinutes: 120,
      description: "Added from expanded catalog list",
      fields: buildRadiologyMainFields(testName),
    });
    existingRadiologyNames.add(normalized);
  }

  console.log(`? Added/updated ${dedupedLab.length} expanded lab tests`);
  console.log(`? Added/updated ${dedupedRadiology.length} expanded radiology tests`);
  console.log(`? Synced ${syncedLabTemplateCount} existing lab templates by name`);

  console.log(`Migrated ${migratedLegacyCardiologyCount} legacy cardiology tests to Cardiology category`);

  const sourceCatalogTests = await runWithRetry("org-sync:sourceCatalogTests", () =>
    prisma.diagnosticTest.findMany({
      where: { organizationId: orgId },
      include: {
        resultFields: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    })
  );

  const otherOrganizations = await runWithRetry("org-sync:otherOrganizations", () =>
    prisma.organization.findMany({
      where: { id: { not: orgId } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    })
  );

  await runWithRetry("org-sync-keepalive", () => prisma.$executeRaw`SELECT 1`);

  let syncedOrganizations = 0;
  for (const targetOrg of otherOrganizations) {
    for (const test of sourceCatalogTests) {
      const targetTest = await runWithRetry(
        `org-sync:upsert:${targetOrg.id}:${test.code}`,
        () =>
          prisma.diagnosticTest.upsert({
            where: {
              organizationId_code: {
                organizationId: targetOrg.id,
                code: test.code,
              },
            },
            update: {
              categoryId: test.categoryId,
              name: test.name,
              type: test.type,
              department: test.department,
              price: test.price,
              costPrice: test.costPrice,
              turnaroundMinutes: test.turnaroundMinutes,
              sampleType: test.sampleType,
              description: test.description,
              isActive: test.isActive,
            },
            create: {
              organizationId: targetOrg.id,
              categoryId: test.categoryId,
              name: test.name,
              code: test.code,
              type: test.type,
              department: test.department,
              price: test.price,
              costPrice: test.costPrice,
              turnaroundMinutes: test.turnaroundMinutes,
              sampleType: test.sampleType,
              description: test.description,
              isActive: test.isActive,
            },
            select: { id: true },
          })
      );

      await replaceResultTemplateFields(
        targetTest.id,
        mapTemplateFields(targetTest.id, test.resultFields),
        `orgSync:${targetOrg.id}:${test.code}`
      );
    }

    await runWithRetry(`org-sync:groupingCopy:${targetOrg.id}`, () =>
      prisma.$executeRaw`
        UPDATE "diagnostic_tests" AS target
        SET "groupKey" = source."groupKey",
            "viewType" = source."viewType",
            "isDefaultInGroup" = source."isDefaultInGroup"
        FROM "diagnostic_tests" AS source
        WHERE source."organizationId" = ${orgId}
          AND target."organizationId" = ${targetOrg.id}
          AND source."code" = target."code"
      `
    );

    syncedOrganizations += 1;
  }

  const sourceOrgTestCount = await runWithRetry("org-sync:sourceOrgTestCount", () =>
    prisma.diagnosticTest.count({ where: { organizationId: orgId } })
  );
  const globalTestCount = await runWithRetry("org-sync:globalTestCount", () =>
    prisma.diagnosticTest.count()
  );
  console.log(`\n? Seeding complete!`);
  console.log(`   Source organization tests: ${sourceOrgTestCount}`);
  console.log(`   Synced catalog to organizations: ${syncedOrganizations}`);
  console.log(`   Tests in database (all organizations): ${globalTestCount}`);
  console.log(`   Categories: ${categories.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });





