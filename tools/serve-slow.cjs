// Serves a production build like a slow or broken connection, for checking the start-up
// screen (round 5, R5-4).
//
//   node tools/serve-slow.cjs dist --port 5190 --rate 4000 --block supplies
//
// --rate   KB/s for each .glb and .hdr response (default: unthrottled)
// --block  answer 503 for files whose name contains this text, until unblocked
//
// GET /__control?block=<text>, /__control?unblock and /__control?log (the files requested
// so far) let a page script change the connection while it runs. No Content-Length is
// sent for throttled files, as with a compressing server, so the page cannot rely on it.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? undefined : args[i + 1];
};
const base = path.resolve(args[0] || "dist");
const port = Number(option("port") || 5190);
const rate = Number(option("rate") || 0) * 1024;
let block = option("block") || "";
const log = [];
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/__control") {
      if (url.searchParams.has("block")) block = url.searchParams.get("block");
      if (url.searchParams.has("unblock")) block = "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ block, log }));
      return;
    }
    const name = decodeURIComponent(url.pathname);
    const file = path.join(
      base,
      name.endsWith("/") ? name + "index.html" : name,
    );
    if (!file.startsWith(base) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const heavy = /\.(glb|hdr)$/.test(file);
    if (heavy) log.push(path.basename(file));
    if (heavy && block && path.basename(file).includes(block)) {
      res.writeHead(503).end();
      return;
    }
    const type = types[path.extname(file)] || "application/octet-stream";
    if (!heavy || !rate) {
      res.writeHead(200, {
        "content-type": type,
        "content-length": fs.statSync(file).size,
      });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": type });
    const data = fs.readFileSync(file),
      chunk = Math.max(1024, Math.round(rate / 20));
    let at = 0;
    const timer = setInterval(() => {
      if (res.destroyed) return clearInterval(timer);
      res.write(data.subarray(at, (at += chunk)));
      if (at >= data.length) {
        clearInterval(timer);
        res.end();
      }
    }, 50);
  })
  .listen(port, () =>
    console.log(`serving ${base} on http://localhost:${port}/`),
  );
