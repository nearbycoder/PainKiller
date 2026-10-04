import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
export default defineConfig({
  base: "./",
  server: {
    port: 5187,
    strictPort: true,
    watch: { ignored: ["**/release/**", "**/art/**", "**/artifacts/**"] },
    // Allow Tailscale MagicDNS hosts for LAN playtests over HTTPS.
    allowedHosts: [".ts.net"],
  },
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { chunkSizeWarningLimit: 800 },
});
