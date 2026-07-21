import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CompareResult } from "./compare.js";

export interface ScreenReportEntry {
  name: string;
  designRelPath: string;
  captureRelPath: string;
  diffRelPath: string;
  result: CompareResult;
  pass: boolean;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_APP_DIST = path.resolve(__dirname, "../report-app/dist");

export function generateReport(reportDir: string, entries: ScreenReportEntry[]): string {
  if (!existsSync(REPORT_APP_DIST)) {
    throw new Error(
      "report-app 빌드 산출물이 없습니다. `npm run build:report-app` (또는 `npm install`)을 먼저 실행하세요."
    );
  }

  cpSync(REPORT_APP_DIST, reportDir, { recursive: true });

  const indexPath = path.join(reportDir, "index.html");
  const html = readFileSync(indexPath, "utf-8");
  const dataScript = `<script>window.__QA_REPORT_DATA__ = ${JSON.stringify(entries)};</script>`;
  writeFileSync(indexPath, html.replace("</head>", `${dataScript}\n</head>`), "utf-8");

  return indexPath;
}
