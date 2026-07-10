import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { prepareHarmonyOsFonts } from "./scripts/prepare-harmonyos-fonts.mjs";

await prepareHarmonyOsFonts();

export default defineConfig({
  plugins: [react()],
  base: "./",
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
