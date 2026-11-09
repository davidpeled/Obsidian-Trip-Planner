// License gate. Run with `npm run check:licenses`; CI runs it too.
//
//   1. Shipped code: bundles src/main.ts exactly as the release does and lists any third-party package that
//      ends up inside main.js. Those are redistributed with the plugin, so each must be permissive (MIT, ISC,
//      BSD, Apache-2.0, ...) and its license notice must travel with the release. Today there are none: the
//      plugin's own code is all there is, and `obsidian` is provided by the app at runtime.
//   2. Everything installed (dev tooling, never shipped): no strong copyleft, no unlicensed or unknown packages.
//
// Anything that is not on the allow-lists fails the check, so a new dependency with a surprising license is
// a decision someone has to make, not something that slips in.
import esbuild from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/** Fine to redistribute inside the plugin (all need their notice kept; none restricts the plugin's own license). */
const SHIPPABLE = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "BlueOak-1.0.0"]);
/** Fine for build and test tooling that is never shipped: also file-level copyleft and other permissive terms. */
const TOOLING = new Set([...SHIPPABLE, "MPL-2.0", "Python-2.0", "CC0-1.0", "Unlicense", "CC-BY-4.0"]);

/** Whether an SPDX expression like "(MIT OR Apache-2.0)" or "MIT AND ISC" is acceptable under `allowed`. */
function acceptable(expression, allowed) {
  const ors = expression.replace(/[()]/g, "").split(/\s+OR\s+/i);
  return ors.some((option) => option.split(/\s+AND\s+/i).every((id) => allowed.has(id.trim())));
}

function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  return "UNKNOWN";
}

/** Every installed package: [{ name, version, license }]. */
function installed() {
  const nm = path.join(root, "node_modules");
  const out = [];
  for (const entry of readdirSync(nm)) {
    const names = entry.startsWith("@") ? readdirSync(path.join(nm, entry)).map((n) => `${entry}/${n}`) : [entry];
    for (const name of names) {
      try {
        const pkg = JSON.parse(readFileSync(path.join(nm, name, "package.json"), "utf8"));
        out.push({ name, version: pkg.version, license: licenseOf(pkg) });
      } catch {
        // Not a package folder (.bin, .package-lock.json, ...).
      }
    }
  }
  return out;
}

// 1. What the release actually contains.
const built = await esbuild.build({
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  write: false,
  metafile: true,
  format: "cjs",
  target: "es2018",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
});
const all = installed();
const bundled = [
  ...new Set(
    Object.keys(built.metafile.inputs)
      .filter((i) => i.includes("node_modules/"))
      .map((i) => i.split("node_modules/").pop().split("/").slice(0, i.split("node_modules/").pop().startsWith("@") ? 2 : 1).join("/"))
  ),
].sort();

const problems = [];
for (const name of bundled) {
  const pkg = all.find((p) => p.name === name);
  if (!pkg || !acceptable(pkg.license, SHIPPABLE)) problems.push(`✗ main.js bundles ${name} (${pkg?.license ?? "?"}), which is not on the shippable allow-list.`);
}

// 2. Everything installed.
for (const pkg of all) if (!acceptable(pkg.license, TOOLING)) problems.push(`✗ ${pkg.name}@${pkg.version} is ${pkg.license}, which is not on the allow-list.`);

const own = Object.keys(built.metafile.inputs).filter((i) => !i.includes("node_modules/")).length;
console.log(
  bundled.length === 0
    ? `main.js contains only this project's own code (${own} source files); no third-party package is redistributed.`
    : `main.js bundles ${bundled.length} third-party package(s): ${bundled.join(", ")}. Ship their license notices with the release.`
);
const counts = {};
for (const pkg of all) counts[pkg.license] = (counts[pkg.license] ?? 0) + 1;
console.log(`${all.length} installed packages (dev tooling): ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(", ")}`);

if (problems.length > 0) {
  problems.forEach((p) => console.error(p));
  process.exit(1);
}
console.log("✓ licenses OK");
