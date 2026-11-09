// Checks that the version files carry the release version, and fails loudly if any does not.
//   node scripts/check-version.mjs <version> [--dir <repo>] [--manifest-only]
// Checks manifest.json, package.json, package-lock.json (both root entries) and that versions.json maps the
// version to the manifest's minAppVersion. With --manifest-only, checks just manifest.json (for the copy
// published on the release, which is the file Obsidian reads).
// A release whose manifest.json disagrees with its tag is rejected by Obsidian, so this is a gate, not a nicety.
import { readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const root = dirAt >= 0 ? path.resolve(args.splice(dirAt, 2)[1]) : path.resolve(import.meta.dirname, "..");
const manifestOnly = args.includes("--manifest-only");
const version = args.find((a) => !a.startsWith("--"));

if (!version) {
  console.error("Usage: node scripts/check-version.mjs <version> [--dir <repo>] [--manifest-only]");
  process.exit(2);
}

const read = (name) => JSON.parse(readFileSync(path.join(root, name), "utf8"));
const manifest = read("manifest.json");
const found = [["manifest.json version", manifest.version]];
if (!manifestOnly) {
  const lock = read("package-lock.json");
  const versions = read("versions.json");
  found.push(
    ["package.json version", read("package.json").version],
    ["package-lock.json version", lock.version],
    ['package-lock.json packages[""] version', lock.packages?.[""]?.version],
    [`versions.json["${version}"] (the minAppVersion)`, versions[version] === manifest.minAppVersion ? version : versions[version]]
  );
}

const wrong = found.filter(([, value]) => value !== version);
if (wrong.length > 0) {
  for (const [what, value] of wrong) console.error(`✗ ${what} is ${JSON.stringify(value)}, expected ${version}`);
  process.exit(1);
}
console.log(`✓ ${found.map(([what]) => what.split(" ")[0]).join(", ")} carry ${version}`);
