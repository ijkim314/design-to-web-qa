import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { recognizeRegionText } from "./ocr.js";
import { getCachedCompare, setCachedCompare, hashBuffer } from "./cache.js";

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

const REGION_CELL_SIZE = 16;
const MIN_REGION_PIXELS = 30;
const MAX_REGIONS = 30;

export async function compareImages(
  designPath: string,
  capturePath: string,
  diffOutputPath: string,
  diffThreshold: number
): Promise<CompareResult> {
  const designRaw = readFileSync(designPath);
  const captureRaw = readFileSync(capturePath);

  // 디자인/캡처 바이트와 diffThreshold가 이전 실행과 완전히 같으면 결과도 항상
  // 같으므로, 픽셀 비교/리전 분류/OCR을 전부 다시 하지 않고 캐시를 재사용한다.
  const cacheKey = `${hashBuffer(designRaw)}:${hashBuffer(captureRaw)}:${diffThreshold}`;
  const cached = getCachedCompare(cacheKey);
  if (cached) {
    writeFileSync(diffOutputPath, cached.diffBuffer);
    return cached.result;
  }

  const designPng = PNG.sync.read(designRaw);
  const capturePng = PNG.sync.read(captureRaw);

  const width = Math.min(designPng.width, capturePng.width);
  const height = Math.min(designPng.height, capturePng.height);
  const dimensionMismatch =
    designPng.width !== capturePng.width || designPng.height !== capturePng.height;

  const designCropped = cropTo(designPng, width, height);
  const captureCropped = cropTo(capturePng, width, height);

  const diff = new PNG({ width, height });
  const diffPixelCount = pixelmatch(
    designCropped.data,
    captureCropped.data,
    diff.data,
    width,
    height,
    { threshold: diffThreshold, diffMask: true }
  );

  const diffBuffer = PNG.sync.write(diff);
  writeFileSync(diffOutputPath, diffBuffer);

  const classified = findDiffRegions(diff.data, width, height).map((region) =>
    classifyRegion(designCropped.data, captureCropped.data, width, height, region)
  );
  const regions = await refineWithOcr(classified, designCropped, captureCropped);

  const totalPixels = width * height;
  const result: CompareResult = {
    diffPixelCount,
    totalPixels,
    diffPercentage: (diffPixelCount / totalPixels) * 100,
    width,
    height,
    dimensionMismatch,
    regions,
  };

  setCachedCompare(cacheKey, result, diffBuffer);
  return result;
}

function cropTo(png: PNG, width: number, height: number): PNG {
  if (png.width === width && png.height === height) return png;
  const cropped = new PNG({ width, height });
  PNG.bitblt(png, cropped, 0, 0, width, height, 0, 0);
  return cropped;
}

/**
 * pixelmatch의 diffMask 출력(다른 픽셀만 alpha>0)을 REGION_CELL_SIZE 단위 셀로 나눠
 * 8방향 연결된 셀들을 하나의 영역으로 묶는다. 안티앨리어싱으로 흩어진 1~2px 잔점들이
 * 셀 단위 클러스터링을 거치며 자연스럽게 하나의 바운딩 박스로 합쳐진다.
 */
function findDiffRegions(diffData: Uint8Array | Uint8ClampedArray, width: number, height: number): RawRegion[] {
  const cols = Math.ceil(width / REGION_CELL_SIZE);
  const rows = Math.ceil(height / REGION_CELL_SIZE);
  const cellDiffCount = new Int32Array(cols * rows);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = diffData[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        const cellX = Math.floor(x / REGION_CELL_SIZE);
        const cellY = Math.floor(y / REGION_CELL_SIZE);
        cellDiffCount[cellY * cols + cellX]++;
      }
    }
  }

  const visited = new Uint8Array(cols * rows);
  const regions: RawRegion[] = [];

  for (let start = 0; start < cellDiffCount.length; start++) {
    if (cellDiffCount[start] === 0 || visited[start]) continue;

    const queue = [start];
    visited[start] = 1;
    let minCellX = start % cols;
    let maxCellX = minCellX;
    let minCellY = Math.floor(start / cols);
    let maxCellY = minCellY;
    let pixelSum = 0;

    while (queue.length > 0) {
      const idx = queue.pop()!;
      const cx = idx % cols;
      const cy = Math.floor(idx / cols);
      pixelSum += cellDiffCount[idx];
      minCellX = Math.min(minCellX, cx);
      maxCellX = Math.max(maxCellX, cx);
      minCellY = Math.min(minCellY, cy);
      maxCellY = Math.max(maxCellY, cy);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          const nIdx = ny * cols + nx;
          if (!visited[nIdx] && cellDiffCount[nIdx] > 0) {
            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
    }

    if (pixelSum < MIN_REGION_PIXELS) continue;

    const x = minCellX * REGION_CELL_SIZE;
    const y = minCellY * REGION_CELL_SIZE;
    regions.push({
      x,
      y,
      width: Math.min((maxCellX + 1) * REGION_CELL_SIZE, width) - x,
      height: Math.min((maxCellY + 1) * REGION_CELL_SIZE, height) - y,
      diffPixelCount: pixelSum,
    });
  }

  regions.sort((a, b) => b.diffPixelCount - a.diffPixelCount);
  return regions.slice(0, MAX_REGIONS);
}

interface RawRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  diffPixelCount: number;
}

const SHIFT_SEARCH_MAX = 6;
const SHIFT_MATCH_RATIO = 0.6;
const COLOR_DIST_THRESHOLD = 40;
const VARIANCE_FLAT_THRESHOLD = 150;
const SAMPLE_GRID = 48;
const CHANNEL_DIFF_THRESHOLD = 60;

const OCR_CONFIDENCE_THRESHOLD = 75;
const MAX_OCR_REGION_DIMENSION = 300;
const MAX_OCR_REGIONS_PER_SCREEN = 5;

type RegionKind = "shift" | "extra" | "missing" | "color" | "content";

interface ClassifiedRegion extends DiffRegion {
  kind: RegionKind;
}

/**
 * 바운딩 박스 안의 실제 픽셀(디자인 vs 퍼블리싱)을 비교해 차이의 성격을 추정한다.
 * 정밀한 비전 분석이 아니라 색상 평균/분산, 소폭 이동 시 diff 감소 여부를 보는 휴리스틱이다.
 */
function classifyRegion(
  designData: Uint8Array | Uint8ClampedArray,
  captureData: Uint8Array | Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  region: RawRegion
): ClassifiedRegion {
  const { x, y, width, height } = region;
  const stride = Math.max(1, Math.round(Math.sqrt(width * height) / SAMPLE_GRID));

  const baseDiff = sampledDiffCount(designData, captureData, imageWidth, imageHeight, region, 0, 0, stride);

  let bestShift = { dx: 0, dy: 0, diff: baseDiff };
  if (baseDiff > 0) {
    for (let dy = -SHIFT_SEARCH_MAX; dy <= SHIFT_SEARCH_MAX; dy++) {
      for (let dx = -SHIFT_SEARCH_MAX; dx <= SHIFT_SEARCH_MAX; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (x + dx < 0 || y + dy < 0 || x + dx + width > imageWidth || y + dy + height > imageHeight) continue;
        const diff = sampledDiffCount(designData, captureData, imageWidth, imageHeight, region, dx, dy, stride);
        if (diff < bestShift.diff) bestShift = { dx, dy, diff };
      }
    }
  }

  const designStats = regionColorStats(designData, imageWidth, x, y, width, height);
  const captureStats = regionColorStats(captureData, imageWidth, x, y, width, height);
  const designColor = toHex(designStats.avg);
  const captureColor = toHex(captureStats.avg);
  const colorDist = Math.sqrt(
    (designStats.avg.r - captureStats.avg.r) ** 2 +
      (designStats.avg.g - captureStats.avg.g) ** 2 +
      (designStats.avg.b - captureStats.avg.b) ** 2
  );

  let description: string;
  let kind: RegionKind;
  if (bestShift.diff <= baseDiff * SHIFT_MATCH_RATIO && (bestShift.dx !== 0 || bestShift.dy !== 0)) {
    description = `위치/간격 차이로 추정 (약 ${bestShift.dx >= 0 ? "+" : ""}${bestShift.dx}px, ${bestShift.dy >= 0 ? "+" : ""}${bestShift.dy}px 이동 시 유사해짐)`;
    kind = "shift";
  } else if (designStats.variance < VARIANCE_FLAT_THRESHOLD && captureStats.variance >= VARIANCE_FLAT_THRESHOLD) {
    description = "퍼블리싱에만 존재하는 요소로 추정 (디자인은 단색/빈 배경)";
    kind = "extra";
  } else if (captureStats.variance < VARIANCE_FLAT_THRESHOLD && designStats.variance >= VARIANCE_FLAT_THRESHOLD) {
    description = "퍼블리싱에서 요소가 누락된 것으로 추정 (디자인에만 콘텐츠 있음)";
    kind = "missing";
  } else if (colorDist >= COLOR_DIST_THRESHOLD) {
    description = `색상 차이로 추정 (디자인 ${designColor} vs 퍼블리싱 ${captureColor})`;
    kind = "color";
  } else {
    description = "콘텐츠 차이로 추정 (텍스트/이미지 내용이 다름)";
    kind = "content";
  }

  return { ...region, description, designColor, captureColor, kind };
}

/**
 * "콘텐츠 차이로 추정"으로 분류된 영역만 OCR로 다시 확인한다.
 * 디자인/퍼블리싱에서 읽은 텍스트가 같으면 폰트 렌더링 차이로 보고 리포트에서 제외하고,
 * 다르면 실제로 인식된 텍스트를 그대로 보여준다. 텍스트를 못 읽으면(아이콘 등) 원래 설명을 둔다.
 */
async function refineWithOcr(
  regions: ClassifiedRegion[],
  designCropped: PNG,
  captureCropped: PNG
): Promise<DiffRegion[]> {
  const result: DiffRegion[] = [];
  let ocrCount = 0;

  for (const { kind, ...region } of regions) {
    // 화면 대부분을 뒤덮는 영역은 로고·입력창·버튼 등 여러 요소가 하나로 뭉친 것이라
    // OCR을 통째로 돌리면 서로 무관한 글자가 섞여 의미 없는 결과가 나온다.
    const isTooLargeForOcr = region.width > MAX_OCR_REGION_DIMENSION || region.height > MAX_OCR_REGION_DIMENSION;
    // regions는 diffPixelCount 내림차순으로 들어오므로, 상한을 넘는 나머지는
    // diff가 작은 content 리전이라 원래 휴리스틱 설명을 유지한 채 건너뛴다.
    if (kind !== "content" || isTooLargeForOcr || ocrCount >= MAX_OCR_REGIONS_PER_SCREEN) {
      result.push(region);
      continue;
    }
    ocrCount++;

    const [design, capture] = await Promise.all([
      recognizeRegionText(designCropped, region.x, region.y, region.width, region.height),
      recognizeRegionText(captureCropped, region.x, region.y, region.width, region.height),
    ]);

    // 아이콘/이미지는 텍스트가 아닌데도 OCR이 억지로 글자를 인식하는 경우가 있어,
    // 확신도가 낮으면 결과를 믿지 않고 원래 설명(기존 휴리스틱)을 유지한다.
    const reliable = design.confidence >= OCR_CONFIDENCE_THRESHOLD && capture.confidence >= OCR_CONFIDENCE_THRESHOLD;
    if (!reliable || !design.text || !capture.text) {
      result.push(region);
      continue;
    }

    if (design.text === capture.text) {
      continue; // 텍스트는 동일 — 렌더링 차이로 보고 리포트에서 제외
    }
    result.push({ ...region, description: `텍스트 차이 감지: "${design.text}" → "${capture.text}"` });
  }

  return result;
}

function sampledDiffCount(
  designData: Uint8Array | Uint8ClampedArray,
  captureData: Uint8Array | Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  region: RawRegion,
  dx: number,
  dy: number,
  stride: number
): number {
  const { x, y, width, height } = region;
  let diffCount = 0;
  for (let yy = 0; yy < height; yy += stride) {
    const cy = y + dy + yy;
    if (cy < 0 || cy >= imageHeight) continue;
    for (let xx = 0; xx < width; xx += stride) {
      const cx = x + dx + xx;
      if (cx < 0 || cx >= imageWidth) continue;
      const dIdx = ((y + yy) * imageWidth + (x + xx)) * 4;
      const cIdx = (cy * imageWidth + cx) * 4;
      const diff =
        Math.abs(designData[dIdx] - captureData[cIdx]) +
        Math.abs(designData[dIdx + 1] - captureData[cIdx + 1]) +
        Math.abs(designData[dIdx + 2] - captureData[cIdx + 2]);
      if (diff > CHANNEL_DIFF_THRESHOLD) diffCount++;
    }
  }
  return diffCount;
}

function regionColorStats(
  data: Uint8Array | Uint8ClampedArray,
  imageWidth: number,
  x: number,
  y: number,
  width: number,
  height: number
): { avg: { r: number; g: number; b: number }; variance: number } {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let lumSum = 0;
  let count = 0;
  const luminances: number[] = [];

  for (let yy = y; yy < y + height; yy++) {
    for (let xx = x; xx < x + width; xx++) {
      const idx = (yy * imageWidth + xx) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      rSum += r;
      gSum += g;
      bSum += b;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lumSum += lum;
      luminances.push(lum);
      count++;
    }
  }

  const avg = { r: rSum / count, g: gSum / count, b: bSum / count };
  const meanLum = lumSum / count;
  const variance = luminances.reduce((sum, l) => sum + (l - meanLum) ** 2, 0) / count;

  return { avg, variance };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
