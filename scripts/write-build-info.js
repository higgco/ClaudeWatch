// Stamps build identity into build-info.json for the running server to read.
// Run via `npm run build-info` as a deploy-time step (or automatically via
// the `prestart` hook). Never runs git at request time — the value is baked
// ahead of deploy so it works in git-less / shallow-cloned containers.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// Non-git environments degrade instead of failing the build.
let revision = null;
const describe = git("describe --tags --always --dirty 2>/dev/null");
if (describe) {
  revision = describe;
} else {
  const short = git("rev-parse --short HEAD");
  if (short) {
    const dirty = git("status --porcelain");
    revision = dirty ? `${short}-dirty` : short;
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const info = {
  version: pkg.version,
  revision: revision || "unknown",
  dirty: revision ? /-dirty$/.test(revision) : false,
  builtAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(root, "build-info.json"), JSON.stringify(info, null, 2) + "\n");
console.log(`[build-info] ${info.version} (${info.revision}), built ${info.builtAt}`);
