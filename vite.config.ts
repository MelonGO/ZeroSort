/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Use relative asset paths so the built index.html works when loaded via
  // file:// inside the packaged Tauri app. Without this, Vite emits absolute
  // URLs like "/assets/..." which resolve to the filesystem root and fail to
  // load, leaving the window blank.
  base: "./",
  server: {
    port: 3000,
    strictPort: true,
    watch: {
      ignored: ["**/out/**", "**/src-tauri/**"],
    },
  },
  test: {
    exclude: ["node_modules/**", "src-tauri/**"],
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
    outDir: "dist",
  },
});
