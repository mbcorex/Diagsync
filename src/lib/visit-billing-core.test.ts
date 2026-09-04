import assert from "node:assert/strict";
import {
  buildReferenceNote,
  evaluateReferenceFlag,
  formatReferenceDisplay,
  type ReferenceField,
} from "./reference-ranges";
import {
  collectedByPaymentMethod,
  summarizeVisitPaymentMethod,
  MIXED_PAYMENT_METHOD,
} from "./payment-methods";
import { mergeReportContent, mergeReportTests } from "./report-merge-core";
import { resolveBackdatedVisitDate, MAX_BACKDATE_DAYS, toDayKey } from "./visit-dating";

function haemoglobinField(): ReferenceField {
  return {
    fieldKey: "haemoglobin",
    fieldType: "NUMBER",
    unit: "g/dL",
    normalMin: 12,
    normalMax: 18,
    referenceNote: buildReferenceNote("", { male: { min: 13, max: 18 }, female: { min: 12, max: 16 } }),
  };
}

// --- Reference ranges ------------------------------------------------------

function testKnownPatientGetsUnlabelledRange() {
  const field = haemoglobinField();
  assert.equal(formatReferenceDisplay(field, { sex: "FEMALE", age: 22 }), "Normal: 12 - 16 g/dL");
  assert.equal(formatReferenceDisplay(field, { sex: "MALE", age: 40 }), "Normal: 13 - 18 g/dL");
}

function testUnknownPatientKeepsDemographicLabel() {
  // Lab settings screens have no patient in hand, so the qualifier still earns its place there.
  assert.equal(formatReferenceDisplay(haemoglobinField()), "Normal (Male): 13 - 18 g/dL");
}

function testMissingDemographicRangeFallsBackToBaseRange() {
  // A range configured only for males must not be quoted as a female patient's reference.
  const field: ReferenceField = {
    fieldKey: "pcv",
    fieldType: "NUMBER",
    unit: "%",
    normalMin: 35,
    normalMax: 53,
    referenceNote: buildReferenceNote("", { male: { min: 40, max: 54 } }),
  };
  assert.equal(formatReferenceDisplay(field, { sex: "FEMALE", age: 22 }), "Normal: 35 - 53 %");
  assert.equal(formatReferenceDisplay(field, { sex: "MALE", age: 22 }), "Normal: 40 - 54 %");
}

function testFlagsUseThePatientsOwnRange() {
  const field = haemoglobinField();
  assert.equal(evaluateReferenceFlag(field, 12.5, { sex: "FEMALE", age: 22 }), "NORMAL");
  assert.equal(evaluateReferenceFlag(field, 12.5, { sex: "MALE", age: 40 }), "LOW");
  assert.equal(evaluateReferenceFlag(field, 17, { sex: "FEMALE", age: 22 }), "HIGH");
}

// --- Payment methods -------------------------------------------------------

function testMixedMethodsAreSummarised() {
  assert.equal(summarizeVisitPaymentMethod(["CASH", "CASH"]), "CASH");
  assert.equal(summarizeVisitPaymentMethod(["CASH", "TRANSFER"]), MIXED_PAYMENT_METHOD);
  assert.equal(summarizeVisitPaymentMethod([null, "", undefined]), null);
  // A previously stored MIXED summary must not be mistaken for a method of its own.
  assert.equal(summarizeVisitPaymentMethod([MIXED_PAYMENT_METHOD, "CASH"]), "CASH");
}

function testCollectionSplitsAcrossMethods() {
  const totals = collectedByPaymentMethod([
    { amount: 3000, paymentMethod: "CASH", paymentType: "PAYMENT" },
    { amount: 5000, paymentMethod: "TRANSFER", paymentType: "PAYMENT" },
  ]);
  assert.equal(totals.CASH, 3000);
  assert.equal(totals.TRANSFER, 5000);
  assert.equal(totals.POS, 0);
}

function testRefundsAndAdjustmentsSubtract() {
  const totals = collectedByPaymentMethod([
    { amount: 5000, paymentMethod: "TRANSFER", paymentType: "PAYMENT" },
    { amount: 1000, paymentMethod: "TRANSFER", paymentType: "REFUND" },
    { amount: 500, paymentMethod: "TRANSFER", paymentType: "ADJUSTMENT" },
  ]);
  assert.equal(totals.TRANSFER, 3500);
}

function testLegacyVisitsFallBackToTheVisitLevelMethod() {
  const totals = collectedByPaymentMethod([], { amountPaid: 2000, paymentMethod: "POS" });
  assert.equal(totals.POS, 2000);
  const unknown = collectedByPaymentMethod([], { amountPaid: 2000, paymentMethod: null });
  assert.equal(unknown.UNKNOWN, 2000);
}

// --- Report merging --------------------------------------------------------

function testNewlyApprovedTestJoinsTheExistingReport() {
  const existing = {
    patient: { fullName: "Jane Doe" },
    tests: [{ testOrderId: "order-1", name: "Full Blood Count", rows: [{ name: "Hb", value: "13.6" }] }],
  };
  const incoming = {
    patient: { fullName: "Jane Doe" },
    tests: [{ testOrderId: "order-2", name: "Malaria Parasite", rows: [{ name: "Result", value: "Positive" }] }],
  };

  const merged = mergeReportContent(existing, incoming) as any;
  assert.equal(merged.tests.length, 2);
  assert.deepEqual(
    merged.tests.map((test: any) => test.name),
    ["Full Blood Count", "Malaria Parasite"]
  );
}

function testReapprovedTestReplacesItsOwnEntryInPlace() {
  const existing = [
    { testOrderId: "order-1", name: "FBC", rows: [{ name: "Hb", value: "13.6" }] },
    { testOrderId: "order-2", name: "MP", rows: [] },
  ];
  const incoming = [{ testOrderId: "order-1", name: "FBC", rows: [{ name: "Hb", value: "14.2" }] }];

  const merged = mergeReportTests(existing, incoming) as any[];
  assert.equal(merged.length, 2);
  assert.equal(merged[0].rows[0].value, "14.2");
  assert.equal(merged[1].name, "MP");
}

function testLegacyContentWithoutTestOrderIdMatchesOnName() {
  const existing = [{ name: "Full Blood Count", rows: [{ name: "Hb", value: "13.6" }] }];
  const incoming = [{ testOrderId: "order-9", name: "Malaria Parasite", rows: [] }];
  const merged = mergeReportTests(existing, incoming) as any[];
  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, "Full Blood Count");
}

function testMergePreservesSignOffAndImaging() {
  const existing = {
    tests: [],
    imagingFiles: [{ url: "a.png" }],
    signOffEntries: [{ signatureImage: "data:image/png;base64,AAA", signatureName: "Dr A" }],
  };
  const incoming = { tests: [], imagingFiles: [{ url: "a.png" }, { url: "b.png" }] };
  const merged = mergeReportContent(existing, incoming) as any;
  assert.equal(merged.imagingFiles.length, 2);
  assert.equal(merged.signOffEntries[0].signatureName, "Dr A");
}

// --- Backdated visits ------------------------------------------------------

function testBackdateResolution() {
  const now = new Date(2026, 8, 4, 10, 30, 0, 0); // 04 Sept 2026

  const sunday = resolveBackdatedVisitDate("2026-08-30", now);
  assert.equal(sunday.ok, true);
  assert.equal(sunday.ok && toDayKey(sunday.date), "2026-08-30");

  const today = resolveBackdatedVisitDate(toDayKey(now), now);
  assert.equal(today.ok, true);
  assert.equal(today.ok && today.date.getTime(), now.getTime());

  const future = resolveBackdatedVisitDate("2026-09-05", now);
  assert.equal(future.ok, false);

  const tooOld = resolveBackdatedVisitDate("2020-01-01", now);
  assert.equal(tooOld.ok, false);
  assert.equal(
    !tooOld.ok && tooOld.error.includes(String(MAX_BACKDATE_DAYS)),
    true
  );

  assert.equal(resolveBackdatedVisitDate("2026-02-30", now).ok, false);
  assert.equal(resolveBackdatedVisitDate("04/09/2026", now).ok, false);
}

function run() {
  testKnownPatientGetsUnlabelledRange();
  testUnknownPatientKeepsDemographicLabel();
  testMissingDemographicRangeFallsBackToBaseRange();
  testFlagsUseThePatientsOwnRange();
  testMixedMethodsAreSummarised();
  testCollectionSplitsAcrossMethods();
  testRefundsAndAdjustmentsSubtract();
  testLegacyVisitsFallBackToTheVisitLevelMethod();
  testNewlyApprovedTestJoinsTheExistingReport();
  testReapprovedTestReplacesItsOwnEntryInPlace();
  testLegacyContentWithoutTestOrderIdMatchesOnName();
  testMergePreservesSignOffAndImaging();
  testBackdateResolution();
  console.log("visit-billing-core tests passed");
}

run();
