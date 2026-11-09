// ESLint: Obsidian's official plugin-review rules, plus the architecture's
// layering as import restrictions, so violations show up while you type.
// src/architecture.spec.ts stays the source of truth and fails the build;
// keep the two in step.
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

const layer = (name) => `(^|/)${name}(/|$)`;
const restrict = (regex, message) => ({ regex, message });

const OUTWARD = {
  application: restrict(layer("application"), "Domain code must not depend on the application layer."),
  infrastructure: restrict(layer("infrastructure"), "Only infrastructure and bootstrap may import adapters."),
  bootstrap: restrict(layer("bootstrap"), "Only bootstrap may import the composition root."),
};
const OBSIDIAN = restrict("^obsidian$", "Only infrastructure/obsidian and bootstrap/plugin.ts may import `obsidian`; go through a port.");

/** One block per area: a later block's `no-restricted-imports` replaces an earlier one's, so each lists all its rules. */
const imports = (files, patterns) => ({ files, rules: { "no-restricted-imports": ["error", { patterns }] } });

/** DOM globals domain and application code must not touch (as in the architecture spec). */
const DOM_GLOBALS = ["document", "window", "HTMLElement", "requestAnimationFrame", "getComputedStyle"].map((name) => ({
  name,
  message: "Domain and application code must not touch the DOM; add a port or do it in infrastructure.",
}));

/** The `no-restricted-globals` entries the Obsidian recommended config sets. */
function obsidianRestrictedGlobals() {
  const setting = obsidianmd.configs.recommended.map((c) => c.rules?.["no-restricted-globals"]).findLast(Array.isArray);
  return setting ? setting.slice(1) : [];
}

const layering = [
  imports(["src/domain/**/*.ts"], [OUTWARD.application, OUTWARD.infrastructure, OUTWARD.bootstrap, OBSIDIAN]),
  imports(["src/application/**/*.ts"], [OUTWARD.infrastructure, OUTWARD.bootstrap, OBSIDIAN]),
  imports(["src/infrastructure/**/*.ts"], [OUTWARD.bootstrap, OBSIDIAN]),
  imports(["src/infrastructure/obsidian/**/*.ts"], [OUTWARD.bootstrap]),
  imports(["src/bootstrap/**/*.ts"], [OBSIDIAN]),
  imports(["src/bootstrap/plugin.ts"], []),
  {
    files: ["src/domain/**/*.ts", "src/application/**/*.ts"],
    ignores: ["**/*.spec.ts"],
    // Added to the Obsidian config's own restricted globals (a rule set here replaces, not extends, theirs).
    rules: { "no-restricted-globals": ["error", ...obsidianRestrictedGlobals(), ...DOM_GLOBALS] },
  },
];

export default defineConfig([
  globalIgnores(["node_modules", "main.js", "coverage"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // Config files and Node scripts sit outside tsconfig.json.
        projectService: { allowDefaultProject: ["*.mjs", "vitest.config.ts", "scripts/*.mjs"] },
      },
    },
  },
  ...layering,

  // Tests build their own fixtures and don't go through Obsidian.
  {
    files: ["**/*.spec.ts", "src/test-support/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  // Obsidian rules that don't fit this plugin.
  {
    rules: {
      // The declarative settings API needs Obsidian 1.13; minAppVersion is 1.7.2.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },

  // Node scripts (build, vault install): not plugin code.
  {
    files: ["*.mjs", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off", // Obsidian's no-console: scripts report to the terminal
      "no-restricted-globals": "off", // `fetch` instead of Obsidian's requestUrl
    },
  },
]);
