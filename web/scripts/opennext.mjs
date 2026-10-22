import { spawnSync } from "node:child_process";
import { renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lockfile = path.join(appDir, "package-lock.json");
const hidden = path.join(appDir, "package-lock.json.opennext");

// Next traces from the repo root (turbopack.root), so standalone output is
// nested under web/. OpenNext uses the nearest lockfile as that root. Hide
// this app's lockfile so it walks up to the repo lockfile and the paths match.
renameSync(lockfile, hidden);
try {
  const result = spawnSync(
    path.join(appDir, "node_modules/.bin/opennextjs-cloudflare"),
    process.argv.slice(2),
    { stdio: "inherit", cwd: appDir },
  );
  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
} finally {
  renameSync(hidden, lockfile);
}
