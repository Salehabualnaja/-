// Starts `next start` on a fresh, throw-away embedded database for e2e tests.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const port = process.argv[2] ?? "3200";
const dir = path.resolve(".data/e2e");
fs.rmSync(dir, { recursive: true, force: true });
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, PGLITE_DIR: dir, DATABASE_URL: "" },
});
const stop = () => child.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => process.exit(code ?? 0));
