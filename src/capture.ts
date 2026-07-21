import { chromium } from "playwright";
import type { QaConfig, ScreenConfig, Viewport } from "./config.js";

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
  outputPath: string
): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    const page = await context.newPage();

    const url = new URL(screen.path, config.baseUrl).toString();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: DISABLE_MOTION_CSS });

    await page.screenshot({ path: outputPath, fullPage: false });
  } finally {
    await browser.close();
  }
}
