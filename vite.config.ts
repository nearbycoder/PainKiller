import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
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
  plugins: [dropSourceTextures()],
  build: { chunkSizeWarningLimit: 800 },
});

/**
 * tools/fetch-art.py downloads source textures into public/assets/textures/<set>/ for the
 * Blender pipeline. The GLBs embed what they need and the runtime only requests the HDR sky,
 * so keep those folders out of dist/ (and therefore out of the web zip and desktop builds).
 */
function dropSourceTextures(): Plugin {
  return {
    name: "drop-source-textures",
    apply: "build",
    closeBundle() {
      const dir = join("dist", "assets", "textures");
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true }))
          if (entry.isDirectory())
            rmSync(join(dir, entry.name), { recursive: true, force: true });
      } catch {}
    },
  };
}
