const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
execFileSync(
  "tar",
  [
    "-C",
    "release",
    "-I",
    "gzip -1",
    "--transform",
    `s,^linux-unpacked,purgatory-${version},`,
    "-cf",
    `release/purgatory-${version}-linux-x64.tar.gz`,
    "linux-unpacked",
  ],
  { stdio: "inherit" },
);
