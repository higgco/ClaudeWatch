// Loads the build identity stamped by scripts/write-build-info.js.
// Falls back gracefully if the file is missing (e.g. never stamped, non-git
// environment), so the server always boots even without build info.
const fs = require("fs");
const path = require("path");

const pkg = require("../package.json");

function getBuildInfo() {
  const fallback = { version: pkg.version, revision: "unknown", dirty: false, builtAt: null };
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "build-info.json"), "utf8");
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

module.exports = { getBuildInfo };
