import http from "node:http";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createQaRequestHandler } from "./api.js";

const PORT = Number(process.env.PORT ?? 5183);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "https://ijkim314.github.io";
const TOKEN = process.env.QA_RUN_TOKEN;
const configPath = process.env.QA_CONFIG_PATH ?? path.resolve("qa.config.json");
const REPORT_APP_DIST = path.resolve("report-app/dist");

if (!TOKEN) {
  console.error("QA_RUN_TOKEN이 설정되어 있지 않습니다. 프로덕션에서는 이 값 없이 실행할 수 없습니다.");
  process.exit(1);
}

const qaHandler = createQaRequestHandler(configPath);
const MUTATING_PATHS = new Set(["/api/run", "/api/run-adhoc", "/api/refresh"]);

function serveStaticIndex(res: http.ServerResponse) {
  const indexPath = path.join(REPORT_APP_DIST, "index.html");
  if (!existsSync(indexPath)) {
    res.statusCode = 500;
    res.end("report-app 빌드 산출물이 없습니다. `npm run build:report-app`을 먼저 실행하세요.");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(readFileSync(indexPath));
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-QA-Token");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.statusCode = 204;
    res.end();
    return;
  }

  const pathname = new URL(req.url ?? "", "http://localhost").pathname;

  if (pathname === "/healthz") {
    res.statusCode = 200;
    res.end("ok");
    return;
  }

  if (MUTATING_PATHS.has(pathname) && req.headers["x-qa-token"] !== TOKEN) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "인증 토큰이 올바르지 않습니다." }));
    return;
  }

  qaHandler(req, res, () => serveStaticIndex(res));
});

server.listen(PORT, () => {
  console.log(`QA 백엔드 서버가 포트 ${PORT}에서 실행 중입니다. (허용 origin: ${ALLOWED_ORIGIN})`);
});
