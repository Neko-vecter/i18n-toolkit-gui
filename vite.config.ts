import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { prepareHarmonyOsFonts } from "./scripts/prepare-harmonyos-fonts.mjs";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };
const gitCommit = String(
  spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout ?? ""
).trim() || "unknown";

await prepareHarmonyOsFonts();

export default defineConfig({
  plugins: [react()],
  define: {
    __VERSION__: JSON.stringify(packageJson.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit)
  },
  base: "./",
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ["**/.electron-user-data/**"]
    }
  }
});
