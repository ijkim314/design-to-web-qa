export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  diffPixelCount: number;
  description: string;
  designColor: string;
  captureColor: string;
}

export interface CompareResult {
  diffPixelCount: number;
  totalPixels: number;
  diffPercentage: number;
  width: number;
  height: number;
  dimensionMismatch: boolean;
  regions: DiffRegion[];
}

export type AxeSeverity = "critical" | "serious" | "moderate" | "minor";

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

export interface ScreenReportEntry {
  name: string;
  designRelPath: string;
  captureRelPath: string;
  diffRelPath: string;
  result: CompareResult;
  pass: boolean;
  accessibility: AccessibilityResult | null;
}

declare global {
  interface Window {
    __QA_REPORT_DATA__?: ScreenReportEntry[];
  }
}
