import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { runQaPipeline, runQaPipelineForConfig, runQaPipelineForScreen, type QaRunResult } from "./pipeline.js";
import { loadConfig, type QaConfig, type ScreenConfig, type Viewport } from "./config.js";
import type { ScreenReportEntry } from "./report.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const ASSET_PREFIX = "/report-assets/";

interface AdhocViewportInput {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
}

interface AdhocScreenInput {
  name?: string;
  path?: string;
  imageBase64?: string;
  viewport?: AdhocViewportInput;
  fullPage?: boolean;
  accessibility?: boolean;
}

interface AdhocRunBody {
  baseUrl?: string;
  screens?: AdhocScreenInput[];
}

function toViewport(input: AdhocViewportInput | undefined, index: number): Viewport | undefined {
  if (!input) return undefined;
  const { width, height, deviceScaleFactor } = input;
  if (width === undefined && height === undefined) return undefined;
  if (!(width && width > 0) || !(height && height > 0)) {
    throw new Error(`${index + 1}번째 화면: 뷰포트 가로/세로는 0보다 큰 값을 입력해야 합니다.`);
  }
  if (deviceScaleFactor !== undefined && !(deviceScaleFactor > 0)) {
    throw new Error(`${index + 1}번째 화면: 배율은 0보다 큰 값을 입력해야 합니다.`);
  }
  return { width, height, deviceScaleFactor: deviceScaleFactor ?? 1 };
}

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T);
      } catch {
        reject(new Error("요청 본문을 해석할 수 없습니다."));
      }
    });
    req.on("error", reject);
  });
}

function uniqueScreenName(base: string, used: Set<string>): string {
  let name = base;
  let n = 2;
  while (used.has(name)) {
    name = `${base} (${n++})`;
  }
  used.add(name);
  return name;
}

let latest: QaRunResult | null = null;
let running = false;

async function runAdhoc(configPath: string, body: AdhocRunBody): Promise<QaRunResult> {
  if (running) throw new Error("이미 QA를 실행하는 중입니다. 완료 후 다시 시도하세요.");
  if (!body.baseUrl) throw new Error("baseUrl을 입력하세요.");
  if (!Array.isArray(body.screens) || body.screens.length === 0) {
    throw new Error("화면을 1개 이상 입력하세요.");
  }

  running = true;
  const tempImagePaths: string[] = [];
  const usedNames = new Set<string>();
  try {
    const screens: ScreenConfig[] = body.screens.map((screen, i) => {
      if (!screen.path) throw new Error(`${i + 1}번째 화면의 상세 경로를 입력하세요.`);
      if (!screen.imageBase64) throw new Error(`${i + 1}번째 화면의 디자인 이미지를 업로드하세요.`);

      const base64 = screen.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64, "base64");
      if (!imageBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error(`${i + 1}번째 화면: PNG 이미지만 업로드할 수 있습니다.`);
      }

      const tempImagePath = path.join(os.tmpdir(), `qa-adhoc-${randomUUID()}.png`);
      writeFileSync(tempImagePath, imageBuffer);
      tempImagePaths.push(tempImagePath);

      return {
        name: uniqueScreenName(screen.name?.trim() || `직접 입력 화면 ${i + 1}`, usedNames),
        designImage: tempImagePath,
        path: screen.path,
        viewport: toViewport(screen.viewport, i),
        fullPage: screen.fullPage ?? true,
        accessibility: screen.accessibility ?? true,
      };
    });

    const baseConfig: QaConfig = loadConfig(configPath);
    const adhocConfig: QaConfig = { ...baseConfig, baseUrl: body.baseUrl, screens };
    latest = await runQaPipelineForConfig(adhocConfig);
    return latest;
  } finally {
    running = false;
    for (const p of tempImagePaths) {
      try {
        unlinkSync(p);
      } catch {
        // 이미 삭제되었거나 접근 불가한 경우는 무시
      }
    }
  }
}

async function runPipeline(configPath: string): Promise<QaRunResult> {
  if (running) throw new Error("이미 QA를 실행하는 중입니다. 완료 후 다시 시도하세요.");
  running = true;
  try {
    latest = await runQaPipeline(configPath);
    return latest;
  } finally {
    running = false;
  }
}

async function refreshScreen(configPath: string, screenName: string): Promise<ScreenReportEntry> {
  if (running) throw new Error("이미 QA를 실행하는 중입니다. 완료 후 다시 시도하세요.");
  if (!latest) throw new Error("먼저 전체 QA를 한 번 실행하세요.");
  running = true;
  try {
    const entry = await runQaPipelineForScreen(configPath, latest.reportDir, screenName);
    const idx = latest.entries.findIndex((e) => e.name === screenName);
    if (idx === -1) throw new Error(`항목을 찾을 수 없습니다: ${screenName}`);
    latest.entries[idx] = entry;
    latest.anyFail = latest.entries.some((e) => !e.pass);
    return entry;
  } finally {
    running = false;
  }
}

// 캡처/디자인/diff 이미지는 새로고침 후에도 파일 경로가 동일하므로, 브라우저가
// 이전 이미지를 캐시해서 보여주지 않도록 버전 쿼리스트링을 붙여준다.
function toApiEntries(entries: ScreenReportEntry[], version = Date.now()) {
  return entries.map((e) => toApiEntry(e, version));
}

function toApiEntry(entry: ScreenReportEntry, version = Date.now()) {
  return {
    ...entry,
    designRelPath: `${ASSET_PREFIX}${entry.designRelPath}?v=${version}`,
    captureRelPath: `${ASSET_PREFIX}${entry.captureRelPath}?v=${version}`,
    diffRelPath: `${ASSET_PREFIX}${entry.diffRelPath}?v=${version}`,
  };
}

export function createQaRequestHandler(
  configPath: string
): (req: IncomingMessage, res: ServerResponse, next?: () => void) => void {
  return (req, res, next) => {
    const parsedUrl = new URL(req.url ?? "", "http://localhost");
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith(ASSET_PREFIX)) {
      if (!latest) {
        res.statusCode = 404;
        res.end("아직 실행된 QA 리포트가 없습니다.");
        return;
      }
      const rel = decodeURIComponent(pathname.slice(ASSET_PREFIX.length));
      const filePath = path.resolve(latest.reportDir, rel);
      if (!filePath.startsWith(latest.reportDir) || !existsSync(filePath)) {
        res.statusCode = 404;
        res.end("파일을 찾을 수 없습니다.");
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.end(readFileSync(filePath));
      return;
    }

    if (pathname === "/api/latest") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ entries: latest ? toApiEntries(latest.entries) : [] }));
      return;
    }

    if (pathname === "/api/run") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("POST만 지원합니다.");
        return;
      }
      runPipeline(configPath)
        .then((result) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entries: toApiEntries(result.entries) }));
        })
        .catch((err: unknown) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        });
      return;
    }

    if (pathname === "/api/run-adhoc") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("POST만 지원합니다.");
        return;
      }
      readJsonBody<AdhocRunBody>(req)
        .then((body) => runAdhoc(configPath, body))
        .then((result) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entries: toApiEntries(result.entries) }));
        })
        .catch((err: unknown) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        });
      return;
    }

    if (pathname === "/api/refresh") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("POST만 지원합니다.");
        return;
      }
      const name = parsedUrl.searchParams.get("name");
      if (!name) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "name 파라미터가 필요합니다." }));
        return;
      }
      refreshScreen(configPath, name)
        .then((entry) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entry: toApiEntry(entry) }));
        })
        .catch((err: unknown) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        });
      return;
    }

    if (next) {
      next();
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
  };
}
