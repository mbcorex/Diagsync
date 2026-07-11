import assert from "node:assert/strict";
import { Department } from "@prisma/client";
import { renderReportHtml } from "./report-rendering";

function testRadiologyExtraFieldsRender() {
  const html = renderReportHtml({
    organization: {
      name: "DiagSync",
      address: "Address",
      phone: "123",
      website: "https://example.com",
      email: "test@example.com",
    },
    department: Department.RADIOLOGY,
    content: {
      patient: { fullName: "Jane Doe", patientId: "P001", age: 30, sex: "F" },
      meta: { visitNumber: "V001", visitDate: new Date().toISOString(), reportDate: new Date().toISOString() },
      tests: [
        {
          name: "Chest X-Ray",
          findings: "Clear lungs",
          impression: "Normal study",
          extraFields: { technique: "PA view", comparison: "None", __signature_name: "Dr A" },
        },
      ],
      signOff: {
        signatureImage: "data:image/png;base64,AAA",
        signatureName: "Dr A",
      },
    },
  });

  assert.equal(html.includes("technique"), true);
  assert.equal(html.includes("PA view"), true);
  assert.equal(html.includes("comparison"), true);
  assert.equal(html.includes("signature-name"), true);
  assert.equal(html.includes("<strong>Age:</strong>"), true);
  assert.equal(html.includes("__signature_name"), false);
}

function testReportHidesBlankAge() {
  const html = renderReportHtml({
    organization: {
      name: "DiagSync",
      address: "Address",
      phone: "123",
      website: "https://example.com",
      email: "test@example.com",
    },
    department: Department.LABORATORY,
    content: {
      patient: { fullName: "Jane Doe", patientId: "P001", age: 0, sex: "F" },
      meta: { visitNumber: "V001", visitDate: new Date().toISOString(), reportDate: new Date().toISOString() },
      tests: [],
    },
  });

  assert.equal(html.includes("<strong>Age:</strong>"), false);
}

function run() {
  testRadiologyExtraFieldsRender();
  testReportHidesBlankAge();
  console.log("report-rendering tests passed");
}

run();

