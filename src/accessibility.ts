import AxeBuilder from "@axe-core/playwright";
import { createRequire } from "node:module";
import type { Page } from "playwright";
import type { AccessibilityScanOptions, AxeSeverity } from "./config.js";

const require = createRequire(import.meta.url);
const koLocale = require("axe-core/locales/ko.json") as {
  rules: Record<string, { description?: string; help?: string }>;
};

const MAX_TARGETS_PER_VIOLATION = 5;

export interface AccessibilityViolation {
  id: string;
  impact: AxeSeverity | null;
  description: string;
  help: string;
  helpUrl: string;
  nodeCount: number;
  targets: string[];
}

export interface AccessibilityResult {
  violations: AccessibilityViolation[];
  countsBySeverity: Record<AxeSeverity, number>;
  failed: boolean;
}

export async function runAccessibilityScan(
  page: Page,
  options: AccessibilityScanOptions
): Promise<AccessibilityResult> {
  const axeResults = await new AxeBuilder({ page })
    .withTags(options.wcagTags)
    .disableRules(options.excludeRules)
    .analyze();

  const violations: AccessibilityViolation[] = axeResults.violations.map((v) => {
    const translated = koLocale.rules[v.id];
    return {
      id: v.id,
      impact: (v.impact as AxeSeverity) ?? null,
      description: translated?.description ?? v.description,
      help: translated?.help ?? v.help,
      helpUrl: v.helpUrl,
      nodeCount: v.nodes.length,
      targets: v.nodes.slice(0, MAX_TARGETS_PER_VIOLATION).map((n) => n.target.join(" ")),
    };
  });

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
