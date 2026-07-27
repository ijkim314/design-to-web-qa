import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadConfig, resolveAccessibilityOptions, resolveViewport, type QaConfig, type ScreenConfig } from "./config.js";
import { captureScreen } from "./capture.js";
import { compareImages } from "./compare.js";
import type { ScreenReportEntry } from "./report.js";

export interface QaRunResult {
  reportDir: string;
  entries: ScreenReportEntry[];
  anyFail: boolean;
}

interface ReportDirs {
  designsDir: string;
  capturesDir: string;
  diffsDir: string;
}

function reportDirs(reportDir: string): ReportDirs {
  const designsDir = path.join(reportDir, "designs");
  const capturesDir = path.join(reportDir, "captures");
  const diffsDir = path.join(reportDir, "diffs");
  for (const dir of [designsDir, capturesDir, diffsDir]) {
    mkdirSync(dir, { recursive: true });
  }
  return { designsDir, capturesDir, diffsDir };
}

async function runScreen(
  config: QaConfig,
  screen: ScreenConfig,
  reportDir: string,
  dirs: ReportDirs
): Promise<ScreenReportEntry> {
  console.log(`[capture] ${screen.name}`);
  const viewport = resolveViewport(config, screen);
  const accessibilityOptions = resolveAccessibilityOptions(config, screen);
  const capturePath = path.join(dirs.capturesDir, `${screen.name}.png`);
  const accessibility = await captureScreen(config, screen, viewport, capturePath, accessibilityOptions);

  if (accessibility) {
    const c = accessibility.countsBySeverity;
    console.log(
      `[a11y] ${screen.name}: critical ${c.critical}, serious ${c.serious}, moderate ${c.moderate}, minor ${c.minor}`
    );
  }

  const designCopyPath = path.join(dirs.designsDir, `${screen.name}.png`);
  copyFileSync(screen.designImage, designCopyPath);

  const diffPath = path.join(dirs.diffsDir, `${screen.name}.png`);
  const result = compareImages(designCopyPath, capturePath, diffPath, config.diffThreshold);
  const pass = result.diffPercentage <= config.failThresholdPercent;

  console.log(
    `[compare] ${screen.name}: diff ${result.diffPercentage.toFixed(3)}% -> ${pass ? "PASS" : "FAIL"}`
  );

  return {
    name: screen.name,
    designRelPath: toWebPath(path.relative(reportDir, designCopyPath)),
    captureRelPath: toWebPath(path.relative(reportDir, capturePath)),
    diffRelPath: toWebPath(path.relative(reportDir, diffPath)),
    result,
    pass,
    accessibility,
  };
}

export async function runQaPipelineForConfig(config: QaConfig): Promise<QaRunResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = path.resolve("reports", timestamp);
  const dirs = reportDirs(reportDir);

  const entries: ScreenReportEntry[] = [];
  for (const screen of config.screens) {
    entries.push(await runScreen(config, screen, reportDir, dirs));
  }

  return { reportDir, entries, anyFail: entries.some((e) => !e.pass) };
}

export async function runQaPipeline(configPath: string): Promise<QaRunResult> {
  const config = loadConfig(configPath);
  return runQaPipelineForConfig(config);
}

export async function runQaPipelineForScreen(
  configPath: string,
  reportDir: string,
  screenName: string
): Promise<ScreenReportEntry> {
  const config = loadConfig(configPath);
  const screen = config.screens.find((s) => s.name === screenName);
  if (!screen) throw new Error(`qa.config.json에서 화면을 찾을 수 없습니다: ${screenName}`);

  const dirs = reportDirs(reportDir);
  return runScreen(config, screen, reportDir, dirs);
}

function toWebPath(p: string): string {
  return p.split(path.sep).join("/");
}
