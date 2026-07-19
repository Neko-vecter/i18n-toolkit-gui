import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";

const compileElectron = spawnSync(
  process.execPath,
  ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"],
  {
    stdio: "inherit",
    shell: false
  }
);

if (compileElectron.status !== 0) {
  process.exit(compileElectron.status ?? 1);
}

await fs.mkdir("dist-electron/preload", { recursive: true });
const compilePreload = spawnSync(
  process.execPath,
  ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.preload.json"],
  {
    stdio: "inherit",
    shell: false
  }
);

if (compilePreload.status !== 0) {
  process.exit(compilePreload.status ?? 1);
}

await fs.writeFile(
  "dist-electron/preload/preload.cjs",
  await fs.readFile("dist-electron/preload-cjs/preload/preload.js"),
  "utf8"
);
