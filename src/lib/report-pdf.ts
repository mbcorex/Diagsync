import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

function findLocalChromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // Ignore invalid paths and continue searching.
    }
  }
  return undefined;
}

export async function renderHtmlToPdfBuffer(html: string) {
  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel) {
    // Better rendering stability in serverless environments.
    chromium.setGraphicsMode = false;
  }
  let executablePath = onVercel ? await chromium.executablePath() : findLocalChromeExecutable();

  if (!executablePath && !onVercel) {
    try {
      const bundledPath = await chromium.executablePath();
      if (bundledPath && existsSync(bundledPath)) {
        executablePath = bundledPath;
      }
    } catch {
      // Ignore fallback resolution failures.
    }
  }

  if (!executablePath) {
    throw new Error("PDF_BROWSER_NOT_FOUND");
  }

  const launchArgs = onVercel
    ? [...chromium.args, "--font-render-hinting=none"]
    : ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"];

  let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: onVercel ? chromium.headless : true,
      args: launchArgs,
      defaultViewport: chromium.defaultViewport ?? { width: 794, height: 1123 },
      ignoreHTTPSErrors: true,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    throw new Error(`PDF_BROWSER_LAUNCH_FAILED:${reason}`);
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function renderHtmlToJpegBuffer(html: string) {
  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel) {
    chromium.setGraphicsMode = false;
  }
  let executablePath = onVercel ? await chromium.executablePath() : findLocalChromeExecutable();
  if (!executablePath && !onVercel) {
    try {
      const bundledPath = await chromium.executablePath();
      if (bundledPath && existsSync(bundledPath)) {
        executablePath = bundledPath;
      }
    } catch {
      // Ignore fallback resolution failures.
    }
  }
  if (!executablePath) {
    throw new Error("PDF_BROWSER_NOT_FOUND");
  }

  const launchArgs = onVercel
    ? [...chromium.args, "--font-render-hinting=none"]
    : ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"];

  let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: onVercel ? chromium.headless : true,
      args: launchArgs,
      defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 2 },
      ignoreHTTPSErrors: true,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    throw new Error(`PDF_BROWSER_LAUNCH_FAILED:${reason}`);
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");
    const jpg = await page.screenshot({
      type: "jpeg",
      quality: 92,
      fullPage: true,
    });
    return Buffer.from(jpg);
  } finally {
    await browser.close();
  }
}
