import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: Number(process.env.VITE_PORT ?? 5175),
    strictPort: true,
    proxy: {
      "/colyseus": {
        target: process.env.VITE_GRAVITY_SERVER_URL ?? "http://127.0.0.1:2568",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ""),
      },
    },
    allowedHosts: ["localhost", "127.0.0.1"],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});