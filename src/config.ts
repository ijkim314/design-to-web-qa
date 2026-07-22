import { readFileSync } from "node:fs";
import path from "node:path";

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export type AxeSeverity = "critical" | "serious" | "moderate" | "minor";

export interface AccessibilityGlobalConfig {
  enabled?: boolean;
  wcagTags?: string[];
  excludeRules?: string[];
  failSeverities?: AxeSeverity[];
}

export type ScreenAccessibilityConfig =
  | boolean
  | { enabled?: boolean; excludeRules?: string[] };

export interface AccessibilityScanOptions {
  wcagTags: string[];
  excludeRules: string[];
  failSeverities: AxeSeverity[];
}

const DEFAULT_WCAG_TAGS = ["wcag2a", "wcag2aa"];
const DEFAULT_FAIL_SEVERITIES: AxeSeverity[] = ["critical", "serious"];

export interface ScreenConfig {
  name: string;
  designImage: string;
  path: string;
  viewport?: Viewport;
  fullPage?: boolean;
  accessibility?: ScreenAccessibilityConfig;
}

export interface QaConfig {
  baseUrl: string;
  viewport: Viewport;
  diffThreshold: number;
  failThresholdPercent: number;
  screens: ScreenConfig[];
  accessibility?: AccessibilityGlobalConfig;
}

export function loadConfig(configPath: string): QaConfig {
  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as QaConfig;

  if (!parsed.baseUrl) throw new Error("qa.config.json: baseUrl이 필요합니다");
  if (!parsed.viewport) throw new Error("qa.config.json: viewport가 필요합니다");
  if (!Array.isArray(parsed.screens) || parsed.screens.length === 0) {
    throw new Error("qa.config.json: screens 배열이 비어있습니다");
  }

  const configDir = path.dirname(path.resolve(configPath));
  for (const screen of parsed.screens) {
    screen.designImage = path.resolve(configDir, screen.designImage);
  }

  return parsed;
}

export function resolveViewport(config: QaConfig, screen: ScreenConfig): Viewport {
  return screen.viewport ?? config.viewport;
}

export function resolveAccessibilityOptions(
  config: QaConfig,
  screen: ScreenConfig
): AccessibilityScanOptions | null {
  if (screen.accessibility === false) return null;

  const globalConfig = config.accessibility ?? {};
  const globalEnabled = globalConfig.enabled ?? true;
  const screenOverride = typeof screen.accessibility === "object" ? screen.accessibility : {};
  const enabled = screenOverride.enabled ?? (screen.accessibility === true ? true : globalEnabled);
  if (!enabled) return null;

  const excludeRules = Array.from(
    new Set([...(globalConfig.excludeRules ?? []), ...(screenOverride.excludeRules ?? [])])
  );

  return {
    wcagTags: globalConfig.wcagTags ?? DEFAULT_WCAG_TAGS,
    excludeRules,
    failSeverities: globalConfig.failSeverities ?? DEFAULT_FAIL_SEVERITIES,
  };
}
