import { spawn, spawnSync } from "node:child_process";
import http from "node:http";

const port = 5173;
const url = `http://127.0.0.1:${port}`;

const compileElectron = spawnSync(
  process.execPath,
  ["scripts/build-electron.mjs"],
  {
    stdio: "inherit",
    shell: false
  }
);

if (compileElectron.status !== 0) {
  process.exit(compileElectron.status ?? 1);
}

const vite = spawn(
  process.execPath,
  ["./node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    stdio: "inherit",
    shell: false
  }
);

let electronProcess;

function waitForServer() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - startedAt > 30000) {
          console.error("Timed out waiting for Vite dev server.");
          process.exit(1);
        }
        setTimeout(check, 250);
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
    };
    check();
  });
}

waitForServer().then(() => {
  electronProcess = spawn(process.execPath, ["./node_modules/electron/cli.js", "."], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: url,
      I18N_TOOLKIT_DEV_USER_DATA: `${process.cwd()}\\.electron-user-data`
    }
  });

  electronProcess.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
});

process.on("SIGINT", () => {
  electronProcess?.kill();
  vite.kill();
  process.exit(0);
});
