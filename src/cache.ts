import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CompareResult } from "./compare.js";
import type { AccessibilityResult } from "./accessibility.js";

// 동일한 디자인 이미지 + 동일한 캡처 스크린샷이면 항상 동일한 비교/접근성 결과가
// 나오므로, 입력 바이트를 키로 하는 콘텐츠 주소 캐시를 둔다. 세션별 실행 상태가
// 아니라 순수 함수 캐시라 여러 세션이 공유해도 안전하다.
const CACHE_DIR = path.resolve(process.env.QA_CACHE_DIR ?? ".qa-cache");
const DIFFS_DIR = path.join(CACHE_DIR, "diffs");
const INDEX_PATH = path.join(CACHE_DIR, "index.json");

interface CacheIndex {
  compare: Record<string, { result: CompareResult; diffFile: string }>;
  accessibility: Record<string, AccessibilityResult>;
}

let index: CacheIndex | null = null;

function loadIndex(): CacheIndex {
  if (index) return index;
  if (existsSync(INDEX_PATH)) {
    try {
      index = JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as CacheIndex;
      return index;
    } catch {
      // 손상된 캐시 파일은 무시하고 새로 시작한다.
    }
  }
  index = { compare: {}, accessibility: {} };
  return index;
}

function persist(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(INDEX_PATH, JSON.stringify(index));
}

export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function getCachedCompare(key: string): { result: CompareResult; diffBuffer: Buffer } | null {
  const entry = loadIndex().compare[key];
  if (!entry) return null;
  const diffPath = path.join(DIFFS_DIR, entry.diffFile);
  if (!existsSync(diffPath)) return null;
  return { result: entry.result, diffBuffer: readFileSync(diffPath) };
}

export function setCachedCompare(key: string, result: CompareResult, diffBuffer: Buffer): void {
  mkdirSync(DIFFS_DIR, { recursive: true });
  const diffFile = `${hashText(key)}.png`;
  writeFileSync(path.join(DIFFS_DIR, diffFile), diffBuffer);
  loadIndex().compare[key] = { result, diffFile };
  persist();
}

export function getCachedAccessibility(key: string): AccessibilityResult | null {
  return loadIndex().accessibility[key] ?? null;
}

export function setCachedAccessibility(key: string, result: AccessibilityResult): void {
  loadIndex().accessibility[key] = result;
  persist();
}
