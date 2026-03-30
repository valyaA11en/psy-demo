import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const nodeModulesPath = path.join(appRoot, "node_modules");
const pathDelimiter = process.platform === "win32" ? ";" : ":";
const inheritedNodePath = process.env.NODE_PATH?.trim();

const env = {
  ...process.env,
  NODE_PATH: inheritedNodePath
    ? `${nodeModulesPath}${pathDelimiter}${inheritedNodePath}`
    : nodeModulesPath,
};

const nextBin = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "build"], {
  cwd: appRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
