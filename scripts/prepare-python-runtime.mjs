import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { spawnSync } from "node:child_process";

const pythonVersion = "3.12.10";
const pythonTag = "python312";
const runtimeDir = path.resolve("build", "python-runtime");
const cacheDir = path.resolve(".cache", "python-runtime");
const pythonZip = path.join(cacheDir, `python-${pythonVersion}-embed-amd64.zip`);
const getPipPath = path.join(cacheDir, "get-pip.py");
const pythonExe = path.join(runtimeDir, "python.exe");
const sitePackages = path.join(runtimeDir, "Lib", "site-packages");
const requirementsPath = path.resolve("i18n-toolkit-python", "requirements.txt");

const pythonUrl = `https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`;
const getPipUrl = "https://bootstrap.pypa.io/get-pip.py";

async function exists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function download(url, target) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  if (await exists(target)) {
    return;
  }

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(target);
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.rmSync(target, { force: true });
          download(response.headers.location, target).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.rmSync(target, { force: true });
          reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (error) => {
        file.close();
        fs.rmSync(target, { force: true });
        reject(error);
      });
  });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function extractPython() {
  if (await exists(pythonExe)) {
    return;
  }

  await fsp.rm(runtimeDir, { recursive: true, force: true });
  await fsp.mkdir(runtimeDir, { recursive: true });

  run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Expand-Archive -LiteralPath ${JSON.stringify(pythonZip)} -DestinationPath ${JSON.stringify(runtimeDir)} -Force`
  ]);
}

async function enableSitePackages() {
  const pthPath = path.join(runtimeDir, `${pythonTag}._pth`);
  const raw = await fsp.readFile(pthPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => (line.trim() === "#import site" ? "import site" : line));

  if (!lines.includes("Lib/site-packages")) {
    const importSiteIndex = lines.findIndex((line) => line.trim() === "import site");
    lines.splice(importSiteIndex === -1 ? lines.length : importSiteIndex, 0, "Lib/site-packages");
  }

  await fsp.mkdir(sitePackages, { recursive: true });
  await fsp.writeFile(pthPath, `${lines.join("\n").trimEnd()}\n`, "utf8");
}

async function installDependencies() {
  const pipMarker = path.join(runtimeDir, "Scripts", "pip.exe");
  if (!(await exists(pipMarker))) {
    run(pythonExe, [getPipPath, "--no-warn-script-location"]);
  }

  run(pythonExe, [
    "-m",
    "pip",
    "install",
    "--upgrade",
    "--target",
    sitePackages,
    "--requirement",
    requirementsPath
  ]);
}

await download(pythonUrl, pythonZip);
await download(getPipUrl, getPipPath);
await extractPython();
await enableSitePackages();
await installDependencies();

console.log(`Prepared Python runtime at ${runtimeDir}`);
