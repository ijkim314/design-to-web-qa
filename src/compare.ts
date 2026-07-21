import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

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

const REGION_CELL_SIZE = 16;
const MIN_REGION_PIXELS = 30;
const MAX_REGIONS = 30;

export function compareImages(
  designPath: string,
  capturePath: string,
  diffOutputPath: string,
  diffThreshold: number
): CompareResult {
  const designPng = PNG.sync.read(readFileSync(designPath));
  const capturePng = PNG.sync.read(readFileSync(capturePath));

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

  writeFileSync(diffOutputPath, PNG.sync.write(diff));

  const regions = findDiffRegions(diff.data, width, height);

  const totalPixels = width * height;
  return {
    diffPixelCount,
    totalPixels,
    diffPercentage: (diffPixelCount / totalPixels) * 100,
    width,
    height,
    dimensionMismatch,
    regions,
  };
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
function findDiffRegions(diffData: Uint8Array | Uint8ClampedArray, width: number, height: number): DiffRegion[] {
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
  const regions: DiffRegion[] = [];

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
