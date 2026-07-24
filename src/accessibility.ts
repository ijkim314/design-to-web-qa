import AxeBuilder from "@axe-core/playwright";
import { createRequire } from "node:module";
import type { Page } from "playwright";
import type { AccessibilityScanOptions, AxeSeverity } from "./config.js";

const require = createRequire(import.meta.url);
const koLocale = require("axe-core/locales/ko.json") as {
  rules: Record<string, { description?: string; help?: string }>;
};
const axeCoreSource = (require("axe-core") as { source: string }).source;
const axeSourceWithKoLocale = `${axeCoreSource};axe.configure({ locale: ${JSON.stringify(koLocale)} });`;

const MAX_TARGETS_PER_VIOLATION = 5;

export interface AccessibilityTarget {
  selector: string;
  html?: string;
  failureSummary?: string;
}

export interface AccessibilityViolation {
  id: string;
  impact: AxeSeverity | null;
  description: string;
  help: string;
  helpUrl: string;
  nodeCount: number;
  targets: AccessibilityTarget[];
}

export interface AccessibilityResult {
  violations: AccessibilityViolation[];
  countsBySeverity: Record<AxeSeverity, number>;
  failed: boolean;
}

async function findOrphanLabelFor(page: Page): Promise<AccessibilityViolation | null> {
  const orphans = await page.evaluate(() => {
    const results: { forId: string; text: string }[] = [];
    document.querySelectorAll("label[for]").forEach((label) => {
      const forId = label.getAttribute("for");
      if (forId && !document.getElementById(forId)) {
        results.push({ forId, text: label.textContent?.trim() ?? "" });
      }
    });
    return results;
  });

  if (orphans.length === 0) return null;

  return {
    id: "label-for-mismatch",
    impact: "serious",
    description: "label의 for 속성이 실제로 존재하는 입력 요소의 id와 일치하지 않습니다.",
    help: "label[for]가 가리키는 id를 가진 입력 요소를 찾을 수 없습니다. label을 클릭/탭해도 해당 입력에 포커스가 가지 않고, 스크린 리더가 의도한 라벨을 읽지 못할 수 있습니다.",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.12/label",
    nodeCount: orphans.length,
    targets: orphans.slice(0, MAX_TARGETS_PER_VIOLATION).map((o) => ({
      selector: `label[for="${o.forId}"]`,
      html: o.text ? `<label for="${o.forId}">${o.text}</label>` : undefined,
    })),
  };
}

export async function runAccessibilityScan(
  page: Page,
  options: AccessibilityScanOptions
): Promise<AccessibilityResult> {
  const axeResults = await new AxeBuilder({ page, axeSource: axeSourceWithKoLocale })
    .withTags(options.wcagTags)
    .disableRules(options.excludeRules)
    .analyze();

  const violations: AccessibilityViolation[] = axeResults.violations.map((v) => ({
    id: v.id,
    impact: (v.impact as AxeSeverity) ?? null,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodeCount: v.nodes.length,
    targets: v.nodes.slice(0, MAX_TARGETS_PER_VIOLATION).map((n) => ({
      selector: n.target.join(" "),
      html: n.html,
      failureSummary: n.failureSummary ?? undefined,
    })),
  }));

  if (!options.excludeRules.includes("label-for-mismatch")) {
    const orphanLabelViolation = await findOrphanLabelFor(page);
    if (orphanLabelViolation) violations.push(orphanLabelViolation);
  }

  const countsBySeverity: Record<AxeSeverity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const v of violations) {
    if (v.impact) countsBySeverity[v.impact] += v.nodeCount;
  }

  const failed = violations.some((v) => v.impact && options.failSeverities.includes(v.impact));

  return { violations, countsBySeverity, failed };
}
