import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { runQaPipeline, type QaRunResult } from "./pipeline.js";
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

function toApiEntries(entries: ScreenReportEntry[]) {
  return entries.map((e) => ({
    ...e,
    designRelPath: ASSET_PREFIX + e.designRelPath,
    captureRelPath: ASSET_PREFIX + e.captureRelPath,
    diffRelPath: ASSET_PREFIX + e.diffRelPath,
  }));
}

function apiPlugin(configPath: string): Plugin {
  return {
    name: "qa-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";

        if (url.startsWith(ASSET_PREFIX)) {
          if (!latest) {
            res.statusCode = 404;
            res.end("아직 실행된 QA 리포트가 없습니다.");
            return;
          }
          const rel = decodeURIComponent(url.slice(ASSET_PREFIX.length));
          const filePath = path.resolve(latest.reportDir, rel);
          if (!filePath.startsWith(latest.reportDir) || !existsSync(filePath)) {
            res.statusCode = 404;
            res.end("파일을 찾을 수 없습니다.");
            return;
          }
          res.setHeader("Content-Type", "image/png");
          res.end(readFileSync(filePath));
          return;
        }

        if (url === "/api/latest") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entries: latest ? toApiEntries(latest.entries) : [] }));
          return;
        }

        if (url === "/api/run") {
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
