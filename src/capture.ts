import { chromium } from "playwright";
import type { AccessibilityScanOptions, QaConfig, ScreenConfig, Viewport } from "./config.js";
import { runAccessibilityScan, type AccessibilityResult } from "./accessibility.js";

const DISABLE_MOTION_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
  }
`;

export async function captureScreen(
  config: QaConfig,
  screen: ScreenConfig,
  viewport: Viewport,
  outputPath: string,
  accessibilityOptions: AccessibilityScanOptions | null
): Promise<AccessibilityResult | null> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    const page = await context.newPage();

    const url = new URL(screen.path, config.baseUrl).toString();
    await page.goto(url, { waitUntil: "load" });
    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch {
      // 광고/분석 스크립트 등으로 네트워크가 완전히 멈추지 않는 사이트 대응
    }
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: DISABLE_MOTION_CSS });

    await page.screenshot({ path: outputPath, fullPage: screen.fullPage ?? false });

    if (!accessibilityOptions) return null;
    return await runAccessibilityScan(page, accessibilityOptions);
  } finally {
    await browser.close();
  }
}
