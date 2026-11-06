import { defineConfig } from "vite";
import path from "node:path";
export default defineConfig({
  root: import.meta.dirname,
  envDir: path.resolve(import.meta.dirname, ".."),
  base: "./",
  build: { outDir: path.resolve(import.meta.dirname, "../public/storefront"), emptyOutDir: true },
});
