import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { runQaPipeline, runQaPipelineForScreen, type QaRunResult } from "./pipeline.js";
import type { ScreenReportEntry } from "./report.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSET_PREFIX = "/report-assets/";

let latest: QaRunResult | null = null;
let running = false;

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

function apiPlugin(configPath: string): Plugin {
  return {
    name: "qa-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
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

        next();
      });
    },
  };
}

async function main() {
  const configPath = process.argv[2] ?? path.resolve("qa.config.json");

  const server = await createServer({
    root: path.join(ROOT, "report-app"),
    plugins: [react(), apiPlugin(configPath)],
    server: { port: 5183 },
  });

  await server.listen();
  console.log("\nQA 리포트 개발 서버가 실행되었습니다. 화면의 \"QA 실행\" 버튼으로 캡처/비교를 다시 돌릴 수 있습니다.\n");
  server.printUrls();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
