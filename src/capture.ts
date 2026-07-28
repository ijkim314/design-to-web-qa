import { chromium, type Browser } from "playwright";
import type { AccessibilityScanOptions, QaConfig, ScreenConfig, Viewport } from "./config.js";
import { runAccessibilityScan, type AccessibilityResult } from "./accessibility.js";
import { Semaphore } from "./semaphore.js";

const DISABLE_MOTION_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
  }
`;

// 여러 세션이 동시에 QA를 실행해도 Chromium 프로세스를 매번 새로 띄우면
// 자원이 제한된 환경(예: Render 무료 플랜 512MB RAM)에서 메모리 부족으로
// 서버가 죽을 수 있다. 브라우저 프로세스 자체는 하나만 재사용하고,
// 세션별 격리는 매 캡처마다 새로 만드는 BrowserContext로 유지한다.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch().catch((err: unknown) => {
      browserPromise = null;
      throw err;
    });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

// 동시에 진행되는 캡처 개수를 제한해 메모리 사용량을 억제한다.
// 무료/저사양 인프라를 고려한 기본값 1 (환경변수로 조정 가능).
const captureSemaphore = new Semaphore(Number(process.env.QA_MAX_CONCURRENT_CAPTURES ?? 1));

export async function captureScreen(
  config: QaConfig,
  screen: ScreenConfig,
  viewport: Viewport,
  outputPath: string,
  accessibilityOptions: AccessibilityScanOptions | null
): Promise<AccessibilityResult | null> {
  const release = await captureSemaphore.acquire();
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    try {
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
      await context.close();
    }
  } finally {
    release();
  }
}
