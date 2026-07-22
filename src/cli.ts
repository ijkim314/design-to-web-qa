import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadConfig, resolveAccessibilityOptions, resolveViewport } from "./config.js";
import { captureScreen } from "./capture.js";
import { compareImages } from "./compare.js";
import { generateReport, type ScreenReportEntry } from "./report.js";

async function main() {
  const configPath = process.argv[2] ?? path.resolve("qa.config.json");
  const config = loadConfig(configPath);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = path.resolve("reports", timestamp);
  const designsDir = path.join(reportDir, "designs");
  const capturesDir = path.join(reportDir, "captures");
  const diffsDir = path.join(reportDir, "diffs");
  for (const dir of [designsDir, capturesDir, diffsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  const entries: ScreenReportEntry[] = [];

  for (const screen of config.screens) {
    console.log(`[capture] ${screen.name}`);
    const viewport = resolveViewport(config, screen);
    const accessibilityOptions = resolveAccessibilityOptions(config, screen);
    const capturePath = path.join(capturesDir, `${screen.name}.png`);
    const accessibility = await captureScreen(config, screen, viewport, capturePath, accessibilityOptions);

    if (accessibility) {
      const c = accessibility.countsBySeverity;
      console.log(
        `[a11y] ${screen.name}: critical ${c.critical}, serious ${c.serious}, moderate ${c.moderate}, minor ${c.minor}`
      );
    }

    const designCopyPath = path.join(designsDir, `${screen.name}.png`);
    copyFileSync(screen.designImage, designCopyPath);

    const diffPath = path.join(diffsDir, `${screen.name}.png`);
    const result = compareImages(designCopyPath, capturePath, diffPath, config.diffThreshold);
    const pass = result.diffPercentage <= config.failThresholdPercent;

    console.log(
      `[compare] ${screen.name}: diff ${result.diffPercentage.toFixed(3)}% -> ${pass ? "PASS" : "FAIL"}`
    );

    entries.push({
      name: screen.name,
      designRelPath: toWebPath(path.relative(reportDir, designCopyPath)),
      captureRelPath: toWebPath(path.relative(reportDir, capturePath)),
      diffRelPath: toWebPath(path.relative(reportDir, diffPath)),
      result,
      pass,
      accessibility,
    });
  }

  const indexPath = generateReport(reportDir, entries);
  console.log(`\n리포트 생성 완료: ${indexPath}`);

  if (!process.env.CI) {
    openInBrowser(indexPath);
  }

  const anyFail = entries.some((e) => !e.pass);
  process.exit(anyFail ? 1 : 0);
}

function toWebPath(p: string): string {
  return p.split(path.sep).join("/");
}

function openInBrowser(filePath: string): void {
  const url = pathToFileURL(filePath).toString();
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", '""', url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
