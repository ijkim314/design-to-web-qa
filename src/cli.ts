import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runQaPipeline } from "./pipeline.js";
import { generateReport } from "./report.js";

async function main() {
  const configPath = process.argv[2] ?? path.resolve("qa.config.json");
  const { reportDir, entries, anyFail } = await runQaPipeline(configPath);

  const indexPath = generateReport(reportDir, entries);
  console.log(`\n리포트 생성 완료: ${indexPath}`);

  if (!process.env.CI) {
    openInBrowser(indexPath);
  }

  process.exit(anyFail ? 1 : 0);
}

function openInBrowser(filePath: string): void {
  const url = pathToFileURL(filePath).toString();
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", '""', url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
