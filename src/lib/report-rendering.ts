// src/lib/report-rendering.ts
import { Department } from "@prisma/client";
import { SIGNOFF_IMAGE_KEY, SIGNOFF_NAME_KEY } from "./report-signoff";
import { formatPatientAge } from "./patient-age";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hasRenderableValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number" || typeof value === "boolean") return true;
  return String(value).trim().length > 0;
}

function formatReportDateTime(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Lagos",
  }).format(parsed);
}

type LabRenderRow = {
  name: string;
  value: string;
  unit: string;
  reference: string;
};

type LabRenderTest = {
  name: string;
  forceShow?: boolean;
  rows: LabRenderRow[];
};

type SensitivityEntry = {
  antibiotic: string;
  zone: string;
  interpretation: string;
};

type WidalRow = {
  organism: string;
  titreO: string;
  h: string;
};

function normalizeToken(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isSensitivityRow(rowName: string) {
  return normalizeToken(rowName).includes("sensitivity");
}

function isCultureRow(rowName: string) {
  const token = normalizeToken(rowName);
  return token.includes("culture");
}

function isMicroscopyRow(rowName: string) {
  const token = normalizeToken(rowName);
  return (
    token.includes("wbc") ||
    token.includes("pus") ||
    token.includes("epithelial") ||
    token.includes("bacterial") ||
    token.includes("yeast")
  );
}

function isMicroscopySummaryRow(rowName: string) {
  const token = normalizeToken(rowName);
  return token === "microscopy" || token.includes("microscopy");
}

type ParsedMicroscopy = {
  byToken: Map<string, string>;
  raw: string;
};

const MICROSCOPY_TOKEN_PATTERNS: Array<{ token: string; pattern: RegExp }> = [
  { token: normalizeToken("WBC/PUS cells/HPF"), pattern: /wbc\s*\/?\s*(?:pus|puc)?\s*cells?\s*\/?\s*hpf/gi },
  { token: normalizeToken("Epithelial cells"), pattern: /epithelial\s*cells?/gi },
  { token: normalizeToken("Bacterial cells"), pattern: /bacterial\s*cells?/gi },
  { token: normalizeToken("Yeast cells"), pattern: /yeast\s*cells?/gi },
];

function parseMicroscopySummary(rawValue: string): ParsedMicroscopy {
  const normalized = rawValue.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const byToken = new Map<string, string>();
  if (!normalized) return { byToken, raw: "" };

  const hits: Array<{ token: string; start: number; end: number }> = [];
  for (const entry of MICROSCOPY_TOKEN_PATTERNS) {
    const pattern = new RegExp(entry.pattern.source, entry.pattern.flags);
    let match: RegExpExecArray | null = pattern.exec(normalized);
    while (match) {
      if (match.index === undefined) {
        match = pattern.exec(normalized);
        continue;
      }
      hits.push({
        token: entry.token,
        start: match.index,
        end: match.index + match[0].length,
      });
      match = pattern.exec(normalized);
    }
  }

  hits.sort((a, b) => a.start - b.start);
  for (let i = 0; i < hits.length; i += 1) {
    const current = hits[i];
    const next = hits[i + 1];
    const rawSegment = normalized.slice(current.end, next ? next.start : normalized.length);
    const cleaned = rawSegment
      .replace(/^[\s:=,-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    if (!byToken.has(current.token)) {
      byToken.set(current.token, cleaned);
    }
  }

  return { byToken, raw: normalized };
}

function isCommentRow(rowName: string) {
  const token = normalizeToken(rowName);
  return token === "comment" || token === "comments" || token.includes("comment");
}

function isHemoglobinRow(rowName: string) {
  const token = normalizeToken(rowName);
  if (!(token.includes("hemoglobin") || token.includes("haemoglobin"))) return false;
  if (token.includes("percent") || token.includes(" pcv ") || token.endsWith(" pcv")) return false;
  if (token.includes("%")) return false;
  return true;
}

function isHemoglobinPercentRow(rowName: string) {
  const token = normalizeToken(rowName);
  if (!(token.includes("hemoglobin") || token.includes("haemoglobin"))) return false;
  return token.includes("percent") || token.includes(" % ") || token.endsWith(" %");
}

function isPcvRow(rowName: string) {
  const token = normalizeToken(rowName);
  return token.includes("pcv") || token.includes("hematocrit") || token.includes("haematocrit");
}

function isFbcTestName(testName: string) {
  const token = normalizeToken(testName);
  return token.includes("full blood count") || token === "fbc" || token.includes(" fbc ");
}

function isMcsTestName(testName: string) {
  const token = normalizeToken(testName);
  return token.includes("m c s");
}

function dualVariantBaseKey(rowName: string) {
  const token = normalizeToken(rowName);
  if (!token.includes("si") && !token.includes("conventional")) return "";
  return token
    .replace(/\b(si|conventional|conv)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dualVariantWeight(rowName: string) {
  const token = normalizeToken(rowName);
  if (token.includes("si")) return 0;
  if (token.includes("conventional") || token.includes("conv")) return 1;
  return 2;
}

function orderLabRows(test: LabRenderTest) {
  const isFbc = isFbcTestName(test.name);
  const indexed = test.rows.map((row, index) => ({ row, index }));
  const ranked = [...indexed].sort((a, b) => {
    const rank = (name: string, index: number) => {
      if (isCommentRow(name)) return 9000 + index;
      if (isFbc) {
        if (isHemoglobinRow(name)) return 0;
        if (isHemoglobinPercentRow(name)) return 1;
        if (isPcvRow(name)) return 2;
      } else {
        if (isHemoglobinRow(name)) return 10;
        if (isHemoglobinPercentRow(name)) return 11;
        if (isPcvRow(name)) return 12;
      }
      return 100 + index;
    };
    const aRank = rank(a.row.name, a.index);
    const bRank = rank(b.row.name, b.index);
    if (aRank !== bRank) return aRank - bRank;
    return a.index - b.index;
  });

  const grouped = new Map<string, Array<(typeof ranked)[number]>>();
  for (const item of ranked) {
    const key = dualVariantBaseKey(item.row.name);
    if (!key) continue;
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }
  const multiGroupKeys = new Set(
    Array.from(grouped.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key]) => key)
  );

  const emitted = new Set<number>();
  const ordered: LabRenderRow[] = [];
  for (const item of ranked) {
    if (emitted.has(item.index)) continue;
    const key = dualVariantBaseKey(item.row.name);
    if (key && multiGroupKeys.has(key)) {
      const peers = (grouped.get(key) ?? []).sort((a, b) => {
        const aw = dualVariantWeight(a.row.name);
        const bw = dualVariantWeight(b.row.name);
        if (aw !== bw) return aw - bw;
        return a.index - b.index;
      });
      for (const peer of peers) {
        if (emitted.has(peer.index)) continue;
        emitted.add(peer.index);
        ordered.push(peer.row);
      }
      continue;
    }
    emitted.add(item.index);
    ordered.push(item.row);
  }
  return ordered;
}

function detectWidalCellType(rowName: string) {
  const token = normalizeToken(rowName);
  if (token.includes(" typhi ") && token.includes(" o")) return { organism: "Salmonella Typhi", type: "O" as const };
  if (token.includes(" typhi ") && token.includes(" h")) return { organism: "Salmonella Typhi", type: "H" as const };
  if (token.includes("paratyphi a") && token.includes(" o")) return { organism: "Salmonella Paratyphi A", type: "O" as const };
  if (token.includes("paratyphi a") && token.includes(" h")) return { organism: "Salmonella Paratyphi A", type: "H" as const };
  if (token.includes("paratyphi b") && token.includes(" o")) return { organism: "Salmonella Paratyphi B", type: "O" as const };
  if (token.includes("paratyphi b") && token.includes(" h")) return { organism: "Salmonella Paratyphi B", type: "H" as const };
  if (token.includes("paratyphi c") && token.includes(" o")) return { organism: "Salmonella Paratyphi C", type: "O" as const };
  if (token.includes("paratyphi c") && token.includes(" h")) return { organism: "Salmonella Paratyphi C", type: "H" as const };
  return null;
}

function asWidalRows(test: LabRenderTest) {
  const fixedOrder: WidalRow[] = [
    { organism: "Salmonella Typhi", titreO: "", h: "" },
    { organism: "Salmonella Paratyphi A", titreO: "", h: "" },
    { organism: "Salmonella Paratyphi B", titreO: "", h: "" },
    { organism: "Salmonella Paratyphi C", titreO: "", h: "" },
  ];
  const byOrganism = new Map(fixedOrder.map((row) => [row.organism, { ...row }]));
  for (const row of test.rows) {
    const cell = detectWidalCellType(row.name);
    if (!cell) continue;
    const target = byOrganism.get(cell.organism);
    if (!target) continue;
    if (cell.type === "O") target.titreO = row.value ?? "";
    if (cell.type === "H") target.h = row.value ?? "";
  }
  const rows = fixedOrder
    .map((item) => byOrganism.get(item.organism) ?? item)
    .filter((row) => hasRenderableValue(row.titreO) || hasRenderableValue(row.h));
  return rows;
}

function renderWidalSection(test: LabRenderTest) {
  const widalRows = asWidalRows(test);
  if (widalRows.length === 0) return "";
  const bodyHtml = widalRows
    .map(
      (row) => `<tr>
          <td>${escapeHtml(row.organism)}</td>
          <td>${escapeHtml(row.titreO || "-")}</td>
          <td>${escapeHtml(row.h || "-")}</td>
        </tr>`
    )
    .join("");
  return `
    <section class="block">
      <h3>${escapeHtml(test.name || "Widal Test")}</h3>
      <table>
        <thead>
          <tr><th>Widal Test</th><th>Titre O</th><th>H</th></tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </section>
  `;
}

function parseSensitivityEntries(rawValue: string): SensitivityEntry[] {
  const text = rawValue.trim();
  if (!text) return [];

  const lines = text
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines
    .map((line) => {
      if (line.includes("||")) {
        const [antibiotic = "", zone = "", interpretation = ""] = line.split("||");
        return {
          antibiotic: antibiotic.trim(),
          zone: zone.trim(),
          interpretation: interpretation.trim().toUpperCase(),
        };
      }

      const cleanLine = line.replace(/\s+/g, " ").trim();
      const interpretationMatch = cleanLine.match(/\b(S|R|I)\b/i);
      const zoneMatch = cleanLine.match(/\b(\d+\+|\+\+\+|\+\+|\+|\d+(?:\.\d+)?\s*mm)\b/i);

      let antibiotic = cleanLine;
      const colonIdx = cleanLine.indexOf(":");
      if (colonIdx > 0) {
        antibiotic = cleanLine.slice(0, colonIdx).trim();
      } else if (interpretationMatch?.index !== undefined) {
        antibiotic = cleanLine.slice(0, interpretationMatch.index).trim();
      } else if (zoneMatch?.index !== undefined) {
        antibiotic = cleanLine.slice(0, zoneMatch.index).trim();
      }

      antibiotic = antibiotic.replace(/[-–:,]+$/g, "").trim();

      return {
        antibiotic,
        zone: zoneMatch?.[1]?.trim() ?? "",
        interpretation: interpretationMatch?.[1]?.toUpperCase() ?? "",
      };
    })
    .filter((item) => item.antibiotic.length > 0);

  if (parsed.length > 0) return parsed;

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((antibiotic) => ({ antibiotic, zone: "", interpretation: "" }));
}

function renderGenericLabSection(test: LabRenderTest) {
  const orderedRows = orderLabRows(test);
  const rowsWithValue = orderedRows.filter((row) => hasRenderableValue(row.value));
  const rows =
    rowsWithValue.length > 0
      ? rowsWithValue
      : test.forceShow
      ? orderedRows.map((row) => ({ ...row, value: hasRenderableValue(row.value) ? row.value : "-" }))
      : [];
  if (rows.length === 0) return "";

  const showUnitColumn = rows.some((row) => row.unit.trim().length > 0);
  const showReferenceColumn = rows.some((row) => row.reference.trim().length > 0);

  const rowHtml = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.value)}</td>
          ${showUnitColumn ? `<td>${escapeHtml(row.unit)}</td>` : ""}
          ${showReferenceColumn ? `<td>${escapeHtml(row.reference)}</td>` : ""}
        </tr>
      `
    )
    .join("");

  return `
    <section class="block">
      <h3>${escapeHtml(test.name || "Laboratory Test")}</h3>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Result</th>
            ${showUnitColumn ? "<th>Unit</th>" : ""}
            ${showReferenceColumn ? "<th>Reference</th>" : ""}
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </section>
  `;
}

function renderMicroCultureSensitivitySection(tests: LabRenderTest[]) {
  if (tests.length === 0) return "";

  const specimenColumns = tests.map((test) => ({
    label: test.name?.trim() || "SPECIMEN",
    rows: test.rows,
    microscopySummary: parseMicroscopySummary(
      test.rows.find((row) => isMicroscopySummaryRow(row.name) && hasRenderableValue(row.value))?.value ?? ""
    ),
  }));

  const preferredMicroscopyRows = [
    "WBC/PUS cells/HPF",
    "Epithelial cells",
    "Bacterial cells",
    "Yeast cells",
  ];

  const microscopyLabelMap = new Map<string, string>();
  for (const label of preferredMicroscopyRows) {
    microscopyLabelMap.set(normalizeToken(label), label);
  }

  for (const test of specimenColumns) {
    for (const row of test.rows) {
      if (!isMicroscopyRow(row.name)) continue;
      const token = normalizeToken(row.name);
      if (!microscopyLabelMap.has(token)) {
        microscopyLabelMap.set(token, row.name);
      }
    }
  }

  const microscopyRows = Array.from(microscopyLabelMap.entries());
  const shouldShowRawMicroscopyRow = specimenColumns.some(
    (test) => test.microscopySummary.raw && test.microscopySummary.byToken.size === 0
  );
  if (shouldShowRawMicroscopyRow) {
    microscopyRows.push(["__microscopy_raw", "Microscopy"]);
  }

  const microscopyHtmlRows = microscopyRows
    .map(([token, label]) => {
      const values = specimenColumns
        .map((test) => {
          if (token === "__microscopy_raw") {
            if (test.microscopySummary.byToken.size > 0) return "-";
            return escapeHtml(test.microscopySummary.raw || "-");
          }
          const found = test.rows.find((row) => normalizeToken(row.name) === token);
          const inferred = found?.value || test.microscopySummary.byToken.get(token) || "";
          return escapeHtml(inferred || "-");
        })
        .map((value) => `<td>${value}</td>`)
        .join("");
      return `<tr><td>${escapeHtml(label)}</td>${values}</tr>`;
    })
    .join("");

  const cultureLines = specimenColumns
    .map((test) => {
      const cultureRows = test.rows.filter(
        (row) => isCultureRow(row.name) && !isSensitivityRow(row.name) && hasRenderableValue(row.value)
      );
      if (cultureRows.length === 0) return "";
      const summary = cultureRows.map((row) => row.value).join(" ").trim();
      if (!summary) return "";
      return `<p><strong>${escapeHtml(test.label)}:</strong> ${escapeHtml(summary)}</p>`;
    })
    .filter(Boolean)
    .join("");

  const sensitivityRaw =
    specimenColumns
      .map((test) => test.rows.find((row) => isSensitivityRow(row.name))?.value ?? "")
      .find((value) => value.trim().length > 0) ?? "";

  const sensitivityEntries = parseSensitivityEntries(sensitivityRaw);
  const sensitivityHtml =
    sensitivityEntries.length > 0
      ? `
        <section class="block sensitivity-block">
          <h3 class="sensitivity-title">SENSITIVITY</h3>
          <div class="sensitivity-wrap">
            <table class="sensitivity-table">
              <thead>
                <tr>
                  <th class="sens-row-title"> </th>
                  ${sensitivityEntries
                    .map(
                      (item) =>
                        `<th class="sens-drug"><span>${escapeHtml(item.antibiotic)}</span></th>`
                    )
                    .join("")}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th class="sens-row-title">Value</th>
                  ${sensitivityEntries
                    .map((item) => `<td>${escapeHtml(item.zone || "-")}</td>`)
                    .join("")}
                </tr>
                <tr>
                  <th class="sens-row-title">Result</th>
                  ${sensitivityEntries
                    .map((item) => `<td class="sens-result">${escapeHtml(item.interpretation || "-")}</td>`)
                    .join("")}
                </tr>
              </tbody>
            </table>
          </div>
          <p class="sensitivity-note"><strong>Note:</strong> S = Sensitivity, R = Resistance, I = Intermediate</p>
        </section>
      `
      : "";

  const microscopyTable =
    microscopyHtmlRows.length > 0
      ? `
        <section class="block">
          <h3>MICROSCOPY CULTURE AND SENSITIVITY</h3>
          <table class="mcs-table">
            <thead>
              <tr>
                <th>SPECIMEN</th>
                ${specimenColumns.map((test) => `<th>${escapeHtml(test.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${microscopyHtmlRows}
            </tbody>
           </table>
        </section>
      `
      : "";

  const cultureHtml = cultureLines
    ? `
      <section class="block culture-report">
        <p><strong>CULTURE (S) REPORT</strong></p>
        ${cultureLines}
      </section>
    `
    : "";

  return `${microscopyTable}${cultureHtml}${sensitivityHtml}`;
}

function renderImagingSection(imagingFiles: any[], reportDepartment: Department, imagingLayout?: any[]) {
  if (imagingFiles.length === 0) return "";
  
  // Filter only images (PDFs handled separately)
  const images = imagingFiles.filter(f => f.fileType?.startsWith("image/"));
  if (images.length === 0) return "";
  
  // If imagingLayout is provided, render a positioned canvas using percent coordinates
  if (Array.isArray(imagingLayout) && imagingLayout.length > 0) {
    const layoutHtml = imagingLayout
      .map((item: any, idx: number) => {
        const found = images.find((i) => i.fileUrl?.includes(item.id) || i.name === item.name || i.fileUrl?.includes(item.name));
        const src = escapeHtml(found?.url || item.url || item.fileUrl || "");
        const left = Number(item.x ?? 0);
        const top = Number(item.y ?? 0);
        const width = Number(item.w ?? 40);
        const height = item.h ? Number(item.h) : null;
        const style = `position:absolute; left:${left}%; top:${top}%; width:${width}%; ${height ? `height:${height}%;` : ""} border:1px solid #e5e7eb; border-radius:6px; overflow:hidden; background:#fff;`;
        return `
          <div class="imaging-card" style="${style}">
            <img src="${src}" style="width:100%; height:100%; object-fit:contain; display:block;" loading="lazy" />
          </div>
        `;
      })
      .join("");

    return `
      <section class="imaging-section" style="page-break-before: auto; position: relative;">
        <h3>Imaging Studies</h3>
        <div style="position:relative; width:100%; height:600px; border:1px solid transparent;">
          ${layoutHtml}
        </div>
      </section>
    `;
  }

  return `
    <section class="imaging-section" style="page-break-before: auto;">
      <h3>Imaging Studies</h3>
      <div class="imaging-grid" style="display: flex; flex-direction: column; gap: 20px;">
        ${images.map((img, idx) => `
          <div class="imaging-card" style="page-break-inside: avoid; break-inside: avoid-page;">
            <p class="imaging-label" style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">
              Image ${idx + 1}: ${escapeHtml(img.name || img.fileName || "Image")}
            </p>
            <img 
              src="${escapeHtml(img.url || img.fileUrl)}" 
              alt="${escapeHtml(img.name || img.fileName || "Radiology Image")}" 
              style="max-width: 100%; max-height: 400px; object-fit: contain; display: block; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px;"
              loading="lazy"
            />
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

// Improved splitRadiologyNarrative - better bullet detection
function splitRadiologyNarrative(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // First, check if this uses line breaks as separators (most common for bullet lists)
  const linePoints = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  
  if (linePoints.length > 1) {
    // Strip bullet markers if present
    return linePoints.map(line => 
      line.replace(/^[\s]*[-*•‣▪▶→›❯]+\s*/, "").replace(/^[\s]*[0-9]+[.)]\s*/, "").trim()
    );
  }

  // Check for bullet markers on single line with semicolons
  if (trimmed.includes(";") && trimmed.split(";").length > 1) {
    return trimmed.split(";").map(s => s.trim());
  }

  // Check for colon-separated items like "Liver: ... Gallbladder: ..."
  // Split at sentence boundaries (period, colon, question mark, exclamation followed by space and capital letter)
  const colonSplit = trimmed.split(/(?<=[.:!?])\s+(?=[A-ZÄÖÜÀ-ÿ])/);
  if (colonSplit.length > 1) {
    return colonSplit.map(s => s.trim());
  }

  // Check for numbered list like "1. ... 2. ..."
  const numberedMatch = trimmed.match(/\d+\.\s+/);
  if (numberedMatch && trimmed.split(/\d+\.\s+/).length > 2) {
    return trimmed.split(/\d+\.\s+/).filter(Boolean).map(s => s.trim());
  }

  // Single point
  return [trimmed];
}

function splitEmbeddedImpression(findingsInput: string, impressionInput: string) {
  const findingsText = findingsInput.trim();
  const impressionText = impressionInput.trim();
  if (!findingsText) return { findingsText, impressionText };

  const match = findingsText.match(/\bimpression\s*:\s*(.+)$/i);
  if (!match || match.index === undefined) {
    return { findingsText, impressionText };
  }

  const cleanedFindings = findingsText.slice(0, match.index).trim();
  const extractedImpression = match[1]?.trim() ?? "";
  return {
    findingsText: cleanedFindings,
    impressionText: impressionText || extractedImpression,
  };
}

// Improved renderNarrativeBlock - better bullet rendering as HTML lists
function renderNarrativeBlock(rawText: string, opts?: { preferList?: boolean }) {
  const points = splitRadiologyNarrative(rawText);
  if (points.length === 0) return `<p class="rad-paragraph">-</p>`;
  
  // Check if this looks like a bullet list (multiple lines or items)
  const looksLikeBulletList = points.length > 1;
  
  // For bullet-style lists, render as UL
  if (looksLikeBulletList && (opts?.preferList ?? false)) {
    return `<ul class="rad-list">${points.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }
  
  // For multi-point lists without explicit markers, render as UL when preferred
  if ((opts?.preferList ?? false) && points.length > 1) {
    return `<ul class="rad-list">${points.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }
  
  // Single point or short text - render as paragraphs
  if (points.length === 1) {
    return `<p class="rad-paragraph">${escapeHtml(points[0])}</p>`;
  }
  
  // Multiple points that don't fit bullet style - render as separate paragraphs
  return points.map((item) => `<p class="rad-paragraph">${escapeHtml(item)}</p>`).join("");
}

type RenderArgs = {
  organization: {
    name: string;
    address: string;
    phone: string;
    website?: string | null;
    email: string;
    logo?: string | null;
    letterheadUrl?: string | null;
  };
  department: Department;
  content: any;
  comments?: string | null;
  prescription?: string | null;
  mdName?: string | null;
  watermarkUrl?: string;
  includeLetterhead?: boolean;
  letterheadMode?: "auto" | "uploaded" | "none";
  showPrintButton?: boolean;
  autoPrint?: boolean;
  baseUrl?: string;
};

function formatWebsiteForLetterhead(url: string) {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const normalized = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, "");
    const path = parsed.pathname.replace(/\/$/, "");
    return `${host}${path && path !== "/" ? path : ""}`;
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

function renderAutoLetterheadLine(label: string, value: string) {
  const cleaned = value.trim();
  if (!cleaned) return "";
  return `<div class="auto-letterhead-line"><span class="auto-letterhead-label">${escapeHtml(label)}</span><span class="auto-letterhead-value">${escapeHtml(cleaned)}</span></div>`;
}

function renderAutoLetterhead(organization: RenderArgs["organization"]) {
  const website = organization.website?.trim() ? formatWebsiteForLetterhead(String(organization.website)) : "";
  return `
    <div class="auto-letterhead-layer">
      <div class="auto-letterhead-card">
        <div class="auto-letterhead-name">${escapeHtml(organization.name)}</div>
        <div class="auto-letterhead-divider"></div>
        <div class="auto-letterhead-details">
          ${renderAutoLetterheadLine("Address", organization.address)}
          ${renderAutoLetterheadLine("Phone", organization.phone)}
          ${website ? `<div class="auto-letterhead-line"><span class="auto-letterhead-label">Website</span><span class="auto-letterhead-value">${escapeHtml(website)}</span></div>` : ""}
        </div>
      </div>
    </div>
  `.trim();
}
export function renderReportHtml(args: RenderArgs) {
  const allowLetterhead = args.includeLetterhead !== false;
  const letterheadMode = args.letterheadMode ?? "uploaded";
  const useUploadedLetterhead = allowLetterhead && letterheadMode === "uploaded" && Boolean(args.organization.letterheadUrl);
  const useAutoLetterhead = allowLetterhead && letterheadMode !== "none" && !useUploadedLetterhead;
  const hasLetterhead = useUploadedLetterhead || useAutoLetterhead;
  const pageHeightPx = 1123;
  const pageWidthPx = 794;
  const contentTopPx = useUploadedLetterhead ? 188 : useAutoLetterhead ? 160 : 148;
  const contentBottomPx = useUploadedLetterhead ? 124 : 92;
  const printMarginTopPx = useUploadedLetterhead ? 188 : useAutoLetterhead ? 160 : 92;
  const printMarginBottomPx = useUploadedLetterhead ? 124 : 96;
  const printMarginSidePx = 40;
  const patient = args.content.patient ?? {};
  const patientAge = patient.age ?? null;
  const hasPatientAge = Number.isFinite(Number(patientAge)) && Number(patientAge) > 0;
  const hasPatientDob = Boolean(String(patient.dateOfBirth ?? "").trim());
  const ageLabel = hasPatientAge || hasPatientDob
    ? formatPatientAge({ age: patientAge, dateOfBirth: patient.dateOfBirth }, "long")
    : "";
  const meta = args.content.meta ?? {};
  const visitDateLabel = formatReportDateTime(meta.visitDate);
  const reportDateLabel = formatReportDateTime(meta.reportDate);
  const referringDoctor = String(meta.referringDoctor ?? "").trim();
  const tests = Array.isArray(args.content.tests) ? args.content.tests : [];
  const safeLabTests = tests.filter((test: any) => Array.isArray(test?.rows));
  const safeRadiologyTests = tests.filter((test: any) => !Array.isArray(test?.rows));
  const imagingFiles = Array.isArray(args.content.imagingFiles) ? args.content.imagingFiles : [];
  const signOff =
    args.content?.signOff &&
    typeof args.content.signOff === "object" &&
    typeof args.content.signOff.signatureImage === "string" &&
    typeof args.content.signOff.signatureName === "string"
      ? args.content.signOff
      : null;

  const testsHtml =
    args.department === Department.LABORATORY
      ? (() => {
          const normalizedLabTests: LabRenderTest[] = safeLabTests.map((test: any) => ({
            name: String(test?.name ?? "Laboratory Test"),
            forceShow: Boolean(test?.forceShow ?? test?.__forceShow),
            rows: (Array.isArray(test?.rows) ? test.rows : []).map((row: any) => ({
              name: String(row?.name ?? ""),
              value: String(row?.value ?? ""),
              unit: String(row?.unit ?? ""),
              reference: String(row?.reference ?? ""),
            })),
          }));

          const microCultureTests = normalizedLabTests.filter((test) => isMcsTestName(test.name));
          const microCultureHtml =
            microCultureTests.length > 0 ? renderMicroCultureSensitivitySection(microCultureTests) : "";
          const renderedMicroCulture = new Set(microCultureTests);
          const genericHtml = normalizedLabTests
            .filter((test) => !renderedMicroCulture.has(test))
            .map((test) => {
              const title = normalizeToken(test.name);
              if (title.includes("widal")) {
                const widalHtml = renderWidalSection(test);
                if (widalHtml) return widalHtml;
              }
              return renderGenericLabSection(test);
            })
            .join("");

          return `${microCultureHtml}${genericHtml}`;
        })()
      : safeRadiologyTests
          .map(
            (test: any) => {
              const normalized = splitEmbeddedImpression(
                String(test.findings ?? ""),
                String(test.impression ?? "")
              );

              return `
              <section class="block">
                <h3>${escapeHtml(String(test.name ?? "Radiology Report"))}</h3>
                <div class="rad-field">
                  <p class="rad-label">Findings</p>
                  ${renderNarrativeBlock(normalized.findingsText, { preferList: true })}
                </div>
                <div class="rad-field">
                  <p class="rad-label">Impression</p>
                  ${renderNarrativeBlock(normalized.impressionText)}
                </div>
                ${
                  test.notes
                    ? `<div class="rad-field">
                        <p class="rad-label">Notes</p>
                        ${renderNarrativeBlock(String(test.notes))}
                      </div>`
                    : ""
                }
                ${
                  test.extraFields && typeof test.extraFields === "object"
                    ? Object.entries(test.extraFields as Record<string, unknown>)
                        .map(([key, value]) => {
                          if (key === SIGNOFF_IMAGE_KEY || key === SIGNOFF_NAME_KEY) return "";
                          if (key === "__perTestReports") return "";
                          const k = String(key ?? "").trim();
                          const v = value === null || value === undefined ? "" : String(value);
                          if (!k) return "";
                          return `<div class="rad-field">
                            <p class="rad-label">${escapeHtml(k)}</p>
                            ${renderNarrativeBlock(v)}
                          </div>`;
                        })
                        .join("")
                    : ""
                }
              </section>
            `;
            }
          )
          .join("");

  const effectiveWatermarkUrl = args.watermarkUrl || null;

  // Add imaging section for radiology reports
  const imagingHtml = args.department === Department.RADIOLOGY && imagingFiles.length > 0
    ? renderImagingSection(imagingFiles, args.department, (args.content as any)?.imagingLayout)
    : "";

  // Add pagination-friendly CSS for images
  const paginationStyles = `
    .imaging-card {
      break-inside: avoid-page;
      page-break-inside: avoid;
      margin-bottom: 16px;
    }
    
    .imaging-card img {
      break-inside: avoid;
      page-break-inside: avoid;
      max-height: 400px;
    }
    
    @media print {
      .imaging-card {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
      }
      
      .imaging-card img {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
        max-height: 400px !important;
      }
    }
  `;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  ${
    args.baseUrl
      ? `<base href="${escapeHtml(
          args.baseUrl.endsWith("/") ? args.baseUrl : `${args.baseUrl}/`
        )}" />`
      : ""
  }
  <title>${escapeHtml(args.organization.name)} - ${args.department === Department.LABORATORY ? "Lab Report" : "Radiology Report"}</title>
  <style>
    @page { size: A4; margin: 0; }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #f3f4f6;
    }
    .page {
      position: relative;
      width: ${pageWidthPx}px;
      max-width: ${pageWidthPx}px;
      min-height: ${pageHeightPx}px;
      height: auto;
      margin: 0 auto;
      box-sizing: border-box;
      padding: ${contentTopPx}px 44px ${contentBottomPx}px;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      background: #ffffff;
      overflow: visible;
      --wm-top-offset: ${hasLetterhead ? "132px" : "82px"};
      --wm-bottom-offset: ${hasLetterhead ? "140px" : "108px"};
    }
    .auto-letterhead-layer {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 0;
      pointer-events: none;
    }
    .auto-letterhead-card {
      margin: 22px 44px 0;
      padding: 0 0 10px;
      color: #111827;
      text-align: center;
      font-family: Georgia, "Times New Roman", serif;
    }
    .auto-letterhead-name {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .auto-letterhead-divider {
      width: 100%;
      height: 0;
      margin: 8px auto 6px;
      border-top: 1.5px solid #111827;
    }
    .auto-letterhead-details {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px 14px;
      font-size: 11px;
      line-height: 1.35;
      color: #111827;
      font-family: Arial, sans-serif;
    }
    .auto-letterhead-line {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: baseline;
      justify-content: center;
    }
    .auto-letterhead-label {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .auto-letterhead-value {
      font-weight: 400;
    }
    .letterhead-layer {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: ${pageHeightPx}px;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .letterhead-layer img {
      width: 100%;
      height: 100%;
      object-fit: fill;
      display: block;
    }
    .watermark {
      position: absolute;
      pointer-events: none;
      z-index: 1;
      opacity: 1;
    }
    .watermark img {
      width: 120px;
      height: auto;
      max-width: none;
      transform: none;
    }
    .watermark-top-left {
      top: var(--wm-top-offset);
      left: 42px;
    }
    .content-shell {
      position: relative;
      z-index: 2;
      max-width: 760px;
      margin: 0 auto;
      padding: 14px 18px;
      background: ${hasLetterhead ? "#ffffff" : "rgba(255, 255, 255, 0.93)"};
      border-radius: 8px;
      overflow: visible;
    }
    .content { position: relative; z-index: 2; }
    .header { margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    h2 { margin: 8px 0; font-size: 16px; }
    h3 { margin: 8px 0; font-size: 14px; }
    p { margin: 4px 0; font-size: 13px; }
    .meta-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .block { margin-bottom: 10px; break-inside: auto; }
    .rad-field { margin: 8px 0 10px; }
    .rad-label {
      margin: 0 0 4px;
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      letter-spacing: 0.01em;
    }
    .rad-paragraph {
      margin: 0 0 6px;
      font-size: 13px;
      line-height: 1.45;
      color: #1f2937;
    }
    .rad-list {
      margin: 0 0 4px 18px;
      padding: 0;
    }
    .rad-list li {
      margin: 0 0 6px;
      font-size: 13px;
      line-height: 1.45;
      color: #1f2937;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; break-inside: auto; page-break-inside: auto; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 1px solid #d1d5db; padding: 5px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .mcs-table th, .mcs-table td { text-align: left; }
    .culture-report p { margin: 3px 0; }
    .sensitivity-block { margin-top: 8px; }
    .sensitivity-title { text-align: center; letter-spacing: 0.03em; margin-bottom: 6px; }
    .sensitivity-wrap { overflow: visible; }
    .sensitivity-table { table-layout: fixed; width: 100%; min-width: 0; }
    .sensitivity-table th,
    .sensitivity-table td {
      border: 1px solid #9ca3af;
      text-align: center;
      padding: 2px 1px;
      font-size: 10px;
    }
    .sensitivity-table .sens-row-title {
      width: 54px;
      min-width: 54px;
      font-weight: 700;
      background: #f9fafb;
    }
    .sensitivity-table .sens-drug {
      width: auto;
      min-width: 0;
      height: 112px;
      padding: 0;
      background: #ffffff;
      vertical-align: bottom;
    }
    .sensitivity-table .sens-drug span {
      display: inline-block;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      line-height: 1.0;
      font-weight: 600;
      padding: 3px 0;
    }
    .sensitivity-table .sens-result { font-weight: 700; color: #b91c1c; }
    .sensitivity-note { margin-top: 6px; font-size: 11px; }
    .footer-note { margin-top: 18px; font-size: 12px; }
    .signature-block {
      margin-top: 16px;
      break-inside: avoid;
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      max-width: 240px;
    }
    .signature-image {
      width: auto;
      max-width: 220px;
      max-height: 78px;
      object-fit: contain;
      display: block;
    }
    .signature-name {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      word-break: break-word;
      max-width: 220px;
    }
    .muted { color: #6b7280; }
    .imaging-section { margin-bottom: 16px; }
    .imaging-grid { display: flex; flex-direction: column; gap: 20px; }
    .imaging-card { 
      border: 1px solid #d1d5db; 
      border-radius: 8px; 
      padding: 8px; 
      background: #fff; 
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    .imaging-card img { 
      width: 100%; 
      max-height: 560px; 
      object-fit: contain; 
      display: block; 
      margin: 0 auto; 
      border-radius: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .imaging-label { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
    .imaging-caption { font-size: 11px; color: #6b7280; margin-top: 6px; word-break: break-all; }
    .preview-actions {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 20;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .preview-print-btn {
      border: 1px solid #1d4ed8;
      background: #1d4ed8;
      color: #ffffff;
      font-size: 13px;
      line-height: 1;
      font-weight: 600;
      border-radius: 8px;
      padding: 10px 14px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    }
    .preview-print-btn:hover {
      background: #1e40af;
      border-color: #1e40af;
    }
    .preview-print-btn:active {
      transform: translateY(1px);
    }
    ${paginationStyles}
    @media screen and (max-width: 860px) {
      .page {
        width: 100%;
        max-width: 100%;
        min-height: auto;
        padding: ${hasLetterhead ? "160px" : "96px"} 10px 76px;
        margin: 0;
      }
      .content-shell {
        max-width: 100%;
        border-radius: 6px;
        padding: 12px;
      }
      .meta-grid {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      h2 { font-size: 15px; }
      h3 { font-size: 13px; }
      p { font-size: 12px; }
      table { font-size: 11px; }
      th, td { padding: 4px; }
      .preview-actions {
        top: 8px;
        right: 8px;
      }
      .preview-print-btn {
        font-size: 12px;
        padding: 8px 11px;
        border-radius: 7px;
      }
    }
    @media print {
      .preview-actions { display: none !important; }
      .auto-letterhead-layer {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 0 !important;
      }
      .letterhead-layer {
        position: fixed !important;
        top: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        height: auto !important;
        z-index: 0 !important;
      }
      .letterhead-layer img {
        width: 100% !important;
        height: 100% !important;
        object-fit: fill !important;
      }
      .page {
        width: auto !important;
        max-width: none !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 !important;
        padding: ${printMarginTopPx}px ${printMarginSidePx}px ${printMarginBottomPx}px !important;
        overflow: visible !important;
      }
      .content-shell {
        border-radius: 0 !important;
        background: #ffffff !important;
        margin: 0 auto !important;
        max-width: none !important;
        padding: 14px 18px !important;
        overflow: visible !important;
      }
      .block,
      .imaging-card,
      .signature-block {
        page-break-inside: auto;
        break-inside: auto;
      }
      h3 {
        page-break-after: avoid;
        break-after: avoid-page;
      }
      .imaging-card,
      .signature-block {
        page-break-inside: avoid;
        break-inside: avoid-page;
      }
      .sensitivity-wrap { overflow: visible !important; }
      .sensitivity-table th,
      .sensitivity-table td {
        font-size: 9px;
        padding: 1px 1px;
      }
      .sensitivity-table .sens-row-title {
        width: 46px;
        min-width: 46px;
      }
      .sensitivity-table .sens-drug {
        height: 98px;
      }
    }
  </style>
</head>
<body>
  ${
    args.showPrintButton
      ? `<div class="preview-actions">
          <button class="preview-print-btn" onclick="window.print()" type="button">Print Report</button>
        </div>`
      : ""
  }
  <main class="page">
    ${
      useUploadedLetterhead && args.organization.letterheadUrl
        ? `<div class="letterhead-layer"><img src="${escapeHtml(args.organization.letterheadUrl)}" alt="letterhead" crossorigin="anonymous" /></div>`
        : ""
    }
    ${useAutoLetterhead ? renderAutoLetterhead(args.organization) : ""}
    ${
      effectiveWatermarkUrl
        ? `<div class="watermark watermark-top-left"><img src="${escapeHtml(effectiveWatermarkUrl)}" alt="watermark" crossorigin="anonymous" /></div>`
        : ""
    }
    <div class="content-shell" id="content-shell">
    <div class="content">
      <h2>${args.department === Department.LABORATORY ? "Laboratory Report" : "Radiology Report"}</h2>
      <div class="meta-grid">
        <p><strong>Patient:</strong> ${escapeHtml(String(patient.fullName ?? "-"))}</p>
        <p><strong>Patient ID:</strong> ${escapeHtml(String(patient.patientId ?? "-"))}</p>
        ${ageLabel ? `<p><strong>Age:</strong> ${escapeHtml(ageLabel)}</p>` : ""}
        <p><strong>Sex:</strong> ${escapeHtml(String(patient.sex ?? "-"))}</p>
        <p><strong>Visit Date:</strong> ${escapeHtml(visitDateLabel)}</p>
        <p><strong>Report Date:</strong> ${escapeHtml(reportDateLabel)}</p>
        ${referringDoctor ? `<p><strong>Referring Doctor:</strong> ${escapeHtml(referringDoctor)}</p>` : ""}
      </div>
      ${imagingHtml}
      ${testsHtml || `<p>No reportable items.</p>`}
      ${
        args.comments
          ? `<section class="block"><h3>MD Comments</h3><p>${escapeHtml(args.comments)}</p></section>`
          : ""
      }
      ${
        args.prescription
          ? `<section class="block"><h3>Prescription</h3><p>${escapeHtml(args.prescription)}</p></section>`
          : ""
      }
      ${
        args.mdName
          ? `<p class="footer-note"><strong>Medical Sign-off:</strong> ${escapeHtml(args.mdName)}</p>`
          : ""
      }
      ${
        signOff
          ? `<section class="signature-block">
              <img class="signature-image" src="${escapeHtml(String(signOff.signatureImage))}" alt="Signature" crossorigin="anonymous" />
              <p class="signature-name">${escapeHtml(String(signOff.signatureName))}</p>
            </section>`
          : ""
      }
    </div>
    </div>
  </main>
</body>
${
  args.autoPrint
    ? `<script>
        window.addEventListener("load", function () {
          setTimeout(function () { window.print(); }, 120);
        });
      </script>`
    : ""
}
</html>
  `.trim();
}

