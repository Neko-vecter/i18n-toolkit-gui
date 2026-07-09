import { spawn } from "node:child_process";
import http from "node:http";

const port = 5173;
const url = `http://127.0.0.1:${port}`;

const vite = spawn(process.execPath, ["./node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], {
  stdio: "inherit",
  shell: false
});

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
      VITE_DEV_SERVER_URL: url
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
