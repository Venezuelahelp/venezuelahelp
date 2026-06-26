import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    // Permite exponer el dev server por túneles ngrok (el subdominio rota en
    // cada arranque, por eso se permite el dominio comodín, no un host fijo).
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
