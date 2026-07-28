import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createQaRequestHandler } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function apiPlugin(configPath: string): Plugin {
  return {
    name: "qa-dev-api",
    configureServer(server) {
      server.middlewares.use(createQaRequestHandler(configPath));
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
