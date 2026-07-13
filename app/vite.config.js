import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// During migration we build to app/dist and the legacy app stays live in ../deploy.
// At cutover (Phase F) outDir flips to "../deploy" with emptyOutDir: true.
export default defineConfig({
  plugins: [svelte()],
  base: "./",
  build: {
    outDir: "dist",
  },
});
