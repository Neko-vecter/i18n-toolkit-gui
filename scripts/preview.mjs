import { spawn, spawnSync } from "node:child_process";

const build = spawnSync("yarn", ["build"], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const electronProcess = spawn(process.execPath, ["./node_modules/electron/cli.js", "."], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    I18N_TOOLKIT_DEV_USER_DATA: `${process.cwd()}\\.electron-user-data`
  }
});

electronProcess.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  electronProcess.kill();
  process.exit(0);
});
