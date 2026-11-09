/**
 * The release scripts (scripts/bump-version.mjs, scripts/check-version.mjs), run for real against scratch copies of
 * the version files. The point: a release's version always lands in manifest.json (and the rest), and a
 * manifest that disagrees with the tag is caught before it ships.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "..");
const FILES = ["manifest.json", "package.json", "package-lock.json", "versions.json"];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "trip-planner-release-"));
  FILES.forEach((f) => cpSync(path.join(REPO, f), path.join(dir, f)));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** The fields of the four version files these tests look at. */
interface VersionFile {
  version: string;
  minAppVersion: string;
  packages: Record<string, { version?: string }>;
  [key: string]: unknown;
}
const read = (name: string) => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as VersionFile;
const write = (name: string, data: unknown) => writeFileSync(path.join(dir, name), `${JSON.stringify(data, null, 2)}\n`);
const bump = (...tags: string[]) => execFileSync("node", [path.join(REPO, "scripts/bump-version.mjs"), "--dir", dir, ...tags], { encoding: "utf8" }).trim();
const check = (version: string, ...flags: string[]) =>
  spawnSync("node", [path.join(REPO, "scripts/check-version.mjs"), version, "--dir", dir, ...flags], { encoding: "utf8" });
const setManifestVersion = (version: string) => write("manifest.json", { ...read("manifest.json"), version });

describe("bump-version", () => {
  it("puts the release version in manifest.json, and in every other version file", () => {
    setManifestVersion("0.1.0");
    expect(bump("0.1.0", "0.1.1")).toBe("0.1.2");
    expect(read("manifest.json").version).toBe("0.1.2");
    expect(read("package.json").version).toBe("0.1.2");
    expect(read("package-lock.json").version).toBe("0.1.2");
    expect(read("package-lock.json").packages[""].version).toBe("0.1.2");
    expect(read("versions.json")["0.1.2"]).toBe(read("manifest.json").minAppVersion);
  });

  it("releases the manifest's version as written when there are no tags yet", () => {
    setManifestVersion("0.1.0");
    expect(bump()).toBe("0.1.0");
    expect(read("manifest.json").version).toBe("0.1.0");
  });

  it("releases a hand-bumped manifest version when it is newer than every tag", () => {
    setManifestVersion("0.2.0");
    expect(bump("0.1.5", "0.1.6")).toBe("0.2.0");
    expect(read("manifest.json").version).toBe("0.2.0");
  });

  it("continues patch numbering from a hand-bumped version", () => {
    setManifestVersion("0.2.0");
    expect(bump("0.1.6", "0.2.0")).toBe("0.2.1");
    expect(read("manifest.json").version).toBe("0.2.1");
  });

  it("ignores a manifest version that is older than the tags (main lags behind releases)", () => {
    setManifestVersion("0.1.0");
    expect(bump("0.3.4")).toBe("0.3.5");
    expect(read("manifest.json").version).toBe("0.3.5");
  });

  it("compares versions as numbers, in any tag order, and ignores tags that aren't versions", () => {
    expect(bump("0.1.9", "latest", "0.1.10", "v2", "0.1.2", "1.0")).toBe("0.1.11");
    expect(read("manifest.json").version).toBe("0.1.11");
  });

  it("changes only the version in manifest.json, and keeps its formatting", () => {
    const before = read("manifest.json");
    bump("0.1.0");
    const raw = readFileSync(path.join(dir, "manifest.json"), "utf8");
    expect({ ...read("manifest.json"), version: before.version }).toEqual(before); // id, name, minAppVersion… untouched
    expect(raw.endsWith("}\n")).toBe(true);
    expect(raw).toContain('\n  "id": "trip-planner"');
  });

  it("keeps the versions of dependencies in the lockfile", () => {
    const dep = Object.entries(read("package-lock.json").packages).find(([k, v]) => k.startsWith("node_modules/") && v.version);
    expect(dep).toBeDefined();
    bump("0.1.0", "0.1.1");
    expect(read("package-lock.json").packages[dep![0]].version).toBe(dep![1].version);
  });

  it("refuses a manifest version that isn't x.y.z", () => {
    setManifestVersion("1.0");
    expect(() => bump()).toThrow();
  });
});

describe("check-version", () => {
  it("passes when every file carries the version", () => {
    bump("0.1.0");
    const result = check("0.1.1");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0.1.1");
  });

  it("fails, naming the file, when manifest.json has another version", () => {
    bump("0.1.0");
    setManifestVersion("0.0.9");
    const result = check("0.1.1");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('manifest.json version is "0.0.9", expected 0.1.1');
  });

  it("fails when package.json, the lockfile or versions.json lag behind", () => {
    bump("0.1.0");
    write("package.json", { ...read("package.json"), version: "0.1.0" });
    const lock = read("package-lock.json");
    lock.packages[""].version = "0.1.0";
    write("package-lock.json", lock);
    write("versions.json", { "0.1.0": "1.7.2" });
    const { status, stderr } = check("0.1.1");
    expect(status).toBe(1);
    expect(stderr).toContain("package.json version");
    expect(stderr).toContain('package-lock.json packages[""] version');
    expect(stderr).toContain('versions.json["0.1.1"]');
  });

  it("fails when versions.json records another minAppVersion than the manifest", () => {
    bump("0.1.0");
    write("versions.json", { ...read("versions.json"), "0.1.1": "0.0.1" });
    expect(check("0.1.1").status).toBe(1);
  });

  it("with --manifest-only, checks just manifest.json (the published asset)", () => {
    bump("0.1.0");
    write("package.json", { ...read("package.json"), version: "9.9.9" }); // not looked at
    expect(check("0.1.1", "--manifest-only").status).toBe(0);
    setManifestVersion("0.1.0");
    expect(check("0.1.1", "--manifest-only").status).toBe(1);
  });

  it("explains its usage when given no version", () => {
    const result = spawnSync("node", [path.join(REPO, "scripts/check-version.mjs")], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage");
  });
});
