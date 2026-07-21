import { readFileSync } from "node:fs";
import path from "node:path";

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface ScreenConfig {
  name: string;
  designImage: string;
  path: string;
  viewport?: Viewport;
}

export interface QaConfig {
  baseUrl: string;
  viewport: Viewport;
  diffThreshold: number;
  failThresholdPercent: number;
  screens: ScreenConfig[];
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
