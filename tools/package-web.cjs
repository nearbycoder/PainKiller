// Packages dist/ as release/purgatory-<version>-web.zip, a static site any file server can host.
// Run through `npm run package:web`, which builds first. Uses only Node's zlib (Node 22.2+).
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const folder = `purgatory-${version}-web`;
const out = path.join(root, "release", `${folder}.zip`);

// Source textures fetched by tools/fetch-art.py are baked into the GLBs; the runtime only
// requests the HDR sky. Refuse to ship anything else from assets/textures/.
const unused = (rel) => /^assets\/textures\/[^/]+\//.test(rel);

function walk(dir, rel = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return walk(path.join(dir, entry.name), r);
    return unused(r) ? [] : [r];
  });
}

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("dist/ is missing; run npm run build first");
  process.exit(1);
}
const files = walk(dist).sort();
const chunks = [],
  central = [];
let offset = 0;
const dosTime = 0x0000,
  dosDate = (2026 - 1980) << 9 | (1 << 5) | 1; // fixed timestamp keeps the zip reproducible
for (const rel of files) {
  const data = fs.readFileSync(path.join(dist, rel));
  const name = Buffer.from(`${folder}/${rel}`);
  // Images and GLBs with embedded JPEGs barely compress; store them to keep packaging fast.
  const store = /\.(jpe?g|png|webp|woff2?)$/i.test(rel);
  const body = store ? data : zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(store ? 0 : 8, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  chunks.push(local, name, body);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(store ? 0 : 8, 10);
  entry.writeUInt16LE(dosTime, 12);
  entry.writeUInt16LE(dosDate, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(body.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += local.length + name.length + body.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([...chunks, directory, end]));
const mb = (n) => (n / 1048576).toFixed(1) + " MB";
const raw = files.reduce((n, f) => n + fs.statSync(path.join(dist, f)).size, 0);
console.log(`${path.relative(root, out)}: ${files.length} files, ${mb(raw)} → ${mb(fs.statSync(out).size)}`);
