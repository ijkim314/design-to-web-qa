import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { runQaPipelineForConfig, runQaPipelineForScreen, type QaRunResult } from "./pipeline.js";
import { loadConfig, type QaConfig, type ScreenConfig, type Viewport } from "./config.js";
import type { ScreenReportEntry } from "./report.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const ASSET_PREFIX = "/report-assets/";
const SESSION_HEADER = "x-qa-session";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

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

function toViewport(input: AdhocViewportInput | undefined, label: string): Viewport | undefined {
  if (!input) return undefined;
  const { width, height, deviceScaleFactor } = input;
  if (width === undefined && height === undefined) return undefined;
  if (!(width && width > 0) || !(height && height > 0)) {
    throw new Error(`${label}: 뷰포트 가로/세로는 0보다 큰 값을 입력해야 합니다.`);
  }
  if (deviceScaleFactor !== undefined && !(deviceScaleFactor > 0)) {
    throw new Error(`${label}: 배율은 0보다 큰 값을 입력해야 합니다.`);
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

// 사용자(브라우저 세션)별로 실행 결과를 분리해서, 여러 명이 동시에 접속해도
// 서로의 리포트/실행 상태를 덮어쓰지 않도록 한다.
interface SessionState {
  id: string;
  latest: QaRunResult | null;
  latestConfig: QaConfig | null;
  latestIsAdhoc: boolean;
  running: boolean;
  lastAccess: number;
}

const sessions = new Map<string, SessionState>();

function cleanupStaleSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (!session.running && now - session.lastAccess > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function getSession(sessionId: string): SessionState {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { id: sessionId, latest: null, latestConfig: null, latestIsAdhoc: false, running: false, lastAccess: 0 };
    sessions.set(sessionId, session);
  }
  session.lastAccess = Date.now();
  cleanupStaleSessions();
  return session;
}

async function runAdhoc(session: SessionState, configPath: string, body: AdhocRunBody): Promise<QaRunResult> {
  if (session.running) throw new Error("이미 QA를 실행하는 중입니다. 완료 후 다시 시도하세요.");
  if (!body.baseUrl) throw new Error("baseUrl을 입력하세요.");
  if (!Array.isArray(body.screens) || body.screens.length === 0) {
    throw new Error("화면을 1개 이상 입력하세요.");
  }

  session.running = true;
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
        viewport: toViewport(screen.viewport, `${i + 1}번째 화면`),
        fullPage: screen.fullPage ?? true,
        accessibility: screen.accessibility ?? true,
      };
    });

    const baseConfig: QaConfig = loadConfig(configPath);
    const adhocConfig: QaConfig = { ...baseConfig, baseUrl: body.baseUrl, screens };
    session.latest = await runQaPipelineForConfig(adhocConfig);
    session.latestConfig = adhocConfig;
    session.latestIsAdhoc = true;
    return session.latest;
  } finally {
    session.running = false;
    for (const p of tempImagePaths) {
      try {
        unlinkSync(p);
      } catch {
        // 이미 삭제되었거나 접근 불가한 경우는 무시
      }
    }
  }
}

async function runPipeline(session: SessionState, configPath: string): Promise<QaRunResult> {
  if (session.running) throw new Error("이미 QA를 실행하는 중입니다. 완료 후 다시 시도하세요.");
  session.running = true;
  try {
    const config = loadConfig(configPath);
    session.latest = await runQaPipelineForConfig(config);
    session.latestConfig = config;
    session.latestIsAdhoc = false;
    return session.latest;
  } finally {
    session.running = false;
  }
}

async function refreshScreen(session: SessionState, screenName: string): Promise<ScreenReportEntry> {
  if (session.running) throw new Error("이미 QA를 실행하는 중입니다. 완료 후 다시 시도하세요.");
  if (!session.latest || !session.latestConfig) throw new Error("먼저 QA를 한 번 실행하세요.");
  session.running = true;
  try {
    const entry = await runQaPipelineForScreen(session.latestConfig, session.latest.reportDir, screenName);
    const idx = session.latest.entries.findIndex((e) => e.name === screenName);
    if (idx === -1) throw new Error(`항목을 찾을 수 없습니다: ${screenName}`);
    session.latest.entries[idx] = entry;
    session.latest.anyFail = session.latest.entries.some((e) => !e.pass);
    return entry;
  } finally {
    session.running = false;
  }
}

async function updateScreen(
  session: SessionState,
  screenName: string,
  input: AdhocScreenInput
): Promise<ScreenReportEntry> {
  if (session.running) throw new Error("이미 QA를 실행하는 중입니다. 완료 후 다시 시도하세요.");
  if (!session.latest || !session.latestConfig || !session.latestIsAdhoc) {
    throw new Error("직접입력으로 실행한 화면만 값을 수정할 수 있습니다.");
  }
  const idx = session.latestConfig.screens.findIndex((s) => s.name === screenName);
  if (idx === -1) throw new Error(`항목을 찾을 수 없습니다: ${screenName}`);
  if (!input.path) throw new Error("상세 경로를 입력하세요.");

  session.running = true;
  let tempImagePath: string | null = null;
  try {
    const existing = session.latestConfig.screens[idx];
    let designImage = existing.designImage;
    if (input.imageBase64) {
      const base64 = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64, "base64");
      if (!imageBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error("PNG 이미지만 업로드할 수 있습니다.");
      }
      tempImagePath = path.join(os.tmpdir(), `qa-adhoc-${randomUUID()}.png`);
      writeFileSync(tempImagePath, imageBuffer);
      designImage = tempImagePath;
    }

    session.latestConfig.screens[idx] = {
      name: screenName,
      designImage,
      path: input.path,
      viewport: toViewport(input.viewport, screenName),
      fullPage: input.fullPage ?? existing.fullPage ?? true,
      accessibility: input.accessibility ?? existing.accessibility ?? true,
    };

    const entry = await runQaPipelineForScreen(session.latestConfig, session.latest.reportDir, screenName);
    const entryIdx = session.latest.entries.findIndex((e) => e.name === screenName);
    if (entryIdx === -1) throw new Error(`항목을 찾을 수 없습니다: ${screenName}`);
    session.latest.entries[entryIdx] = entry;
    session.latest.anyFail = session.latest.entries.some((e) => !e.pass);
    return entry;
  } finally {
    session.running = false;
    if (tempImagePath) {
      try {
        unlinkSync(tempImagePath);
      } catch {
        // 이미 삭제되었거나 접근 불가한 경우는 무시
      }
    }
  }
}

// 캡처/디자인/diff 이미지는 새로고침 후에도 파일 경로가 동일하므로, 브라우저가
// 이전 이미지를 캐시해서 보여주지 않도록 버전 쿼리스트링을 붙여준다.
function toApiEntries(session: SessionState, entries: ScreenReportEntry[], version = Date.now()) {
  return entries.map((e) => toApiEntry(session, e, version));
}

function toApiEntry(session: SessionState, entry: ScreenReportEntry, version = Date.now()) {
  const screen = session.latestConfig?.screens.find((s) => s.name === entry.name);
  const assetPrefix = `${ASSET_PREFIX}${session.id}/`;
  return {
    ...entry,
    designRelPath: `${assetPrefix}${entry.designRelPath}?v=${version}`,
    captureRelPath: `${assetPrefix}${entry.captureRelPath}?v=${version}`,
    diffRelPath: `${assetPrefix}${entry.diffRelPath}?v=${version}`,
    input: screen
      ? {
          path: screen.path,
          viewport: screen.viewport,
          fullPage: screen.fullPage ?? true,
          accessibility: typeof screen.accessibility === "boolean" ? screen.accessibility : true,
        }
      : undefined,
  };
}

export function createQaRequestHandler(
  configPath: string
): (req: IncomingMessage, res: ServerResponse, next?: () => void) => void {
  return (req, res, next) => {
    const parsedUrl = new URL(req.url ?? "", "http://localhost");
    const pathname = parsedUrl.pathname;

    // 정적 자산 경로는 <img src>로 요청되어 커스텀 헤더를 보낼 수 없으므로,
    // 세션 식별자를 경로 자체(/report-assets/{sessionId}/...)에 담아 전달한다.
    if (pathname.startsWith(ASSET_PREFIX)) {
      const rest = pathname.slice(ASSET_PREFIX.length);
      const slashIdx = rest.indexOf("/");
      const sessionId = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
      const rel = slashIdx === -1 ? "" : decodeURIComponent(rest.slice(slashIdx + 1));
      const session = sessions.get(sessionId);
      if (!session?.latest) {
        res.statusCode = 404;
        res.end("아직 실행된 QA 리포트가 없습니다.");
        return;
      }
      const filePath = path.resolve(session.latest.reportDir, rel);
      if (!filePath.startsWith(session.latest.reportDir) || !existsSync(filePath)) {
        res.statusCode = 404;
        res.end("파일을 찾을 수 없습니다.");
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.end(readFileSync(filePath));
      return;
    }

    if (!pathname.startsWith("/api/")) {
      if (next) {
        next();
        return;
      }
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    const sessionIdHeader = req.headers[SESSION_HEADER];
    if (typeof sessionIdHeader !== "string" || !sessionIdHeader) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "세션 식별자가 필요합니다." }));
      return;
    }
    const session = getSession(sessionIdHeader);

    if (pathname === "/api/latest") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          entries: session.latest ? toApiEntries(session, session.latest.entries) : [],
          source: session.latestIsAdhoc ? "adhoc" : "config",
        })
      );
      return;
    }

    if (pathname === "/api/run") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("POST만 지원합니다.");
        return;
      }
      runPipeline(session, configPath)
        .then((result) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entries: toApiEntries(session, result.entries), source: "config" }));
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
        .then((body) => runAdhoc(session, configPath, body))
        .then((result) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entries: toApiEntries(session, result.entries), source: "adhoc" }));
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
      refreshScreen(session, name)
        .then((entry) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entry: toApiEntry(session, entry) }));
        })
        .catch((err: unknown) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        });
      return;
    }

    if (pathname === "/api/update-screen") {
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
      readJsonBody<AdhocScreenInput>(req)
        .then((body) => updateScreen(session, name, body))
        .then((entry) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entry: toApiEntry(session, entry) }));
        })
        .catch((err: unknown) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        });
      return;
    }

    res.statusCode = 404;
    res.end("Not Found");
  };
}
