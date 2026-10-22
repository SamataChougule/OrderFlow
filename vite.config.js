import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = (env.VITE_BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");
  const websocketUrl = backendUrl.replace(/^http/, "ws");

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": { target: backendUrl, changeOrigin: true },
        "/ws": { target: websocketUrl, ws: true, changeOrigin: true },
      },
    },
  };
});
