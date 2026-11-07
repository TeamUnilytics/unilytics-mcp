#!/usr/bin/env node

// Builds dist-mcpb/unilytics.mcpb: the Claude Desktop Extension.
//
//   manifest.json                mcpb/manifest.json with the version stamped from package.json
//   icon.png
//   server/index.cjs             the bridge and its runtime code in one readable file
//   THIRD_PARTY_LICENSES.txt     the licence of every package inside that file
//
// One file instead of node_modules: the SDK's server-side dependencies (express, hono and so on) are about 49 MB
// the bridge never runs. CommonJS because Claude Desktop runs it in an Electron utility process and nothing here needs
// ESM. Compiling to node18 syntax keeps it loadable on any Node that Desktop ships or finds.

import { build } from "esbuild";
import { packExtension, validateManifest } from "@anthropic-ai/mcpb";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staging = join(root, "dist-mcpb", "bundle");
const output = join(root, "dist-mcpb", "unilytics.mcpb");

// What ships inside users' Claude. A new package here is a deliberate decision: review it, then add it.
const ALLOWED_PACKAGES = new Set([
  "@modelcontextprotocol/sdk",
  "content-type",
  "eventsource-parser",
  "pkce-challenge",
  "zod",
]);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

rmSync(join(root, "dist-mcpb"), { recursive: true, force: true });
mkdirSync(join(staging, "server"), { recursive: true });

const { metafile } = await build({
  absWorkingDir: root,
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(staging, "server", "index.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  legalComments: "none", // collected into THIRD_PARTY_LICENSES.txt below
  metafile: true,
  logLevel: "warning",
});

// Package name → folder, from the files that actually ended up in the output. The folder comes from that file's path
// (the greedy match takes the innermost node_modules), so a nested copy's licence is the one that ships.
const bundled = new Map();
for (const input of Object.keys(Object.values(metafile.outputs)[0].inputs)) {
  const match = input.match(/^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//);
  if (match) bundled.set(`${match[2]}\0${match[1]}`, { name: match[2], dir: join(root, match[1]) });
}
if (bundled.size === 0) {
  throw new Error("Found no packages in the bundle's metafile: the path matching above must be wrong.");
}
const unexpected = [...bundled.values()].map(({ name }) => name).filter((name) => !ALLOWED_PACKAGES.has(name));
if (unexpected.length > 0) {
  throw new Error(`Packages not reviewed for the bundle: ${unexpected.join(", ")}. Review them, then allow them here.`);
}

const packages = [...bundled.values()].sort((a, b) => a.name.localeCompare(b.name));
const notices = packages.map(({ name, dir }) => {
  const { version, license } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find((entry) => /^licen[cs]e/i.test(entry));
  if (!file) throw new Error(`${name} has no licence file to ship.`);
  return `${name}@${version} (${license})\n\n${readFileSync(join(dir, file), "utf8").trim()}\n`;
});
writeFileSync(join(staging, "THIRD_PARTY_LICENSES.txt"), notices.join(`\n${"-".repeat(72)}\n\n`));

const manifest = JSON.parse(readFileSync(join(root, "mcpb", "manifest.json"), "utf8"));
manifest.version = pkg.version;
writeFileSync(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(join(root, "mcpb", "icon.png"), join(staging, "icon.png"));

if (!validateManifest(join(staging, "manifest.json"))) {
  throw new Error("mcpb manifest validation failed.");
}
if (!(await packExtension({ extensionPath: staging, outputPath: output, silent: true }))) {
  throw new Error("mcpb pack failed.");
}

const size = (statSync(output).size / 1024).toFixed(0);
console.log(`Built ${output} (v${pkg.version}, ${size} KB). Bundled: ${packages.map(({ name }) => name).join(", ")}`);
