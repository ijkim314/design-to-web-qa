export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  diffPixelCount: number;
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

export interface ScreenReportEntry {
  name: string;
  designRelPath: string;
  captureRelPath: string;
  diffRelPath: string;
  result: CompareResult;
  pass: boolean;
}

declare global {
  interface Window {
    __QA_REPORT_DATA__: ScreenReportEntry[];
  }
}
