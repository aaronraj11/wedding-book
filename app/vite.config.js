import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Builds straight into ../deploy — the folder Cloudflare serves (wrangler.jsonc).
// public/ carries manifest.json + icons so deploy/ stays self-contained.
export default defineConfig({
  plugins: [svelte()],
  base: "./",
  build: {
    outDir: "../deploy",
    emptyOutDir: true,
  },
});
