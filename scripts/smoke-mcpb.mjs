#!/usr/bin/env node

// Tests the packed dist-mcpb/unilytics.mcpb the way Claude Desktop loads it.
//
// It unpacks into a temp folder outside the repo with a space in its name: inside the repo, Node would walk up into
// our own node_modules and hide anything missing from the bundle. It then resolves the launch config with
// getMcpConfigForManifest (the function Desktop itself uses) and runs the whole bridge test suite on that entry.

import { getMcpConfigForManifest, unpackExtension } from "@anthropic-ai/mcpb";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcpb = join(root, "dist-mcpb", "unilytics.mcpb");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

assert.ok(existsSync(mcpb), "Run `npm run build:mcpb` first.");
assert.ok(statSync(mcpb).size < 2 * 1024 * 1024, "The bundle should stay under 2 MB: did node_modules get packed?");

const dir = mkdtempSync(join(tmpdir(), "unilytics mcpb smoke "));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

assert.ok(await unpackExtension({ mcpbPath: mcpb, outputDir: dir, silent: true }), "mcpb unpack failed");

const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

assert.equal(manifest.version, pkg.version, "manifest version is stamped from package.json");

// The extension id comes from these two. Changing either one makes Desktop treat an update as a new extension.
assert.equal(manifest.name, "unilytics");
assert.equal(manifest.author.name, "Unilytics");

const apiKey = manifest.user_config.api_key;
assert.equal(apiKey.type, "string");
assert.equal(apiKey.sensitive, true, "the key must be stored by Desktop's secure storage");
assert.equal(apiKey.required, true, "Desktop must ask for the key before enabling");

// With a runtime constraint, Desktop can look for a system Node. Without one it always uses its built-in Node.
assert.equal(manifest.compatibility.runtimes, undefined, "must stay runnable with no Node on PATH");

assert.ok(existsSync(join(dir, "icon.png")));
const licences = readFileSync(join(dir, "THIRD_PARTY_LICENSES.txt"), "utf8");
assert.match(licences, /^@modelcontextprotocol\/sdk@\d/m, "every bundled package's licence must ship");
assert.match(licences, /^zod@\d/m, "every bundled package's licence must ship");
assert.ok(!existsSync(join(dir, "node_modules")), "everything must be in server/index.cjs");

const value = "ulk_test_resolved_by_desktop_code";
const config = await getMcpConfigForManifest({
  manifest,
  extensionPath: dir,
  systemDirs: { HOME: homedir(), DESKTOP: homedir(), DOCUMENTS: homedir(), DOWNLOADS: homedir() },
  userConfig: { api_key: value },
  pathSeparator: sep,
});
assert.equal(config.command, "node");
assert.equal(config.env.UNILYTICS_API_KEY, value, "user_config.api_key must reach the bridge as UNILYTICS_API_KEY");
const entry = config.args[0];
assert.ok(existsSync(entry), `the resolved entry ${entry} must exist`);

console.log(`Bundle checks passed. Running the bridge tests on ${entry}`);
const result = spawnSync(process.execPath, ["--test", join(root, "tests", "bridge.test.mjs")], {
  stdio: "inherit",
  // Run from the temp folder so nothing can resolve from the repo.
  cwd: dir,
  env: { ...process.env, BRIDGE_ENTRY: entry },
});
process.exit(result.status ?? 1);
