import { PNG } from "pngjs";
import { createWorker, OEM, type Worker } from "tesseract.js";
import { fileURLToPath } from "node:url";

const OCR_SCALE = 3;

// eng.traineddata / kor.traineddata가 위치한 프로젝트 루트 (오프라인 환경에서 CDN 접근 없이 로드하기 위함)
const LANG_PATH = fileURLToPath(new URL("..", import.meta.url));

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("kor+eng", OEM.LSTM_ONLY, {
      langPath: LANG_PATH,
      gzip: false,
      cacheMethod: "none",
      logger: () => {},
    });
  }
  return workerPromise;
}

function cropRegionUpscaled(png: PNG, x: number, y: number, width: number, height: number): Buffer {
  const scaled = new PNG({ width: width * OCR_SCALE, height: height * OCR_SCALE });
  for (let yy = 0; yy < scaled.height; yy++) {
    const srcY = y + Math.floor(yy / OCR_SCALE);
    for (let xx = 0; xx < scaled.width; xx++) {
      const srcX = x + Math.floor(xx / OCR_SCALE);
      const srcIdx = (srcY * png.width + srcX) * 4;
      const dstIdx = (yy * scaled.width + xx) * 4;
      scaled.data[dstIdx] = png.data[srcIdx];
      scaled.data[dstIdx + 1] = png.data[srcIdx + 1];
      scaled.data[dstIdx + 2] = png.data[srcIdx + 2];
      scaled.data[dstIdx + 3] = 255;
    }
  }
  return PNG.sync.write(scaled);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "");
}

export interface OcrResult {
  text: string;
  confidence: number;
}

/** 영역을 3배 확대한 뒤 OCR로 텍스트를 추출한다. 공백은 제거해 비교에 쓴다. */
export async function recognizeRegionText(
  png: PNG,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<OcrResult> {
  const worker = await getWorker();
  const buffer = cropRegionUpscaled(png, x, y, width, height);
  const { data } = await worker.recognize(buffer);
  return { text: normalize(data.text), confidence: data.confidence };
}
