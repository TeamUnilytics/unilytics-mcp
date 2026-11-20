// Publishes the Claude plugin zip as GitHub release plugin-v<version> (UNI-1363). Run it from a clean checkout of main
// at the commit to release, after bumping `version` in plugins/unilytics/.claude-plugin/plugin.json and the two doc
// links (build-plugin.mjs --check fails until they agree):
//
//   node scripts/release-plugin.mjs
//
// The release is never marked "latest": releases/latest/download/unilytics.mcpb must keep serving the Desktop
// extension (README "Versions and updates"). The script checks that afterwards. Releases are immutable, so a published
// version is never rebuilt: bump the version instead.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "TeamUnilytics/unilytics-mcp";
const ZIP = join(ROOT, "dist-plugin", "unilytics-plugin.zip");
// run() returns the command's stdout; show() streams it to the terminal instead (execFileSync returns null when
// stdout is inherited, so the two can't share one helper).
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts }).trim();
const show = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });

function fail(message) {
  console.error(`release-plugin: ${message}`);
  process.exit(1);
}

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") fail(`on ${branch}; release from main`);
run("git", ["fetch", "origin", "main"]);
const head = run("git", ["rev-parse", "HEAD"]);
if (head !== run("git", ["rev-parse", "origin/main"])) fail("HEAD is not origin/main; pull first");

show("node", ["scripts/build-plugin.mjs", "--check"]);
const version = JSON.parse(readFileSync(join(ROOT, "plugins/unilytics/.claude-plugin/plugin.json"), "utf8")).version;
const tag = `plugin-v${version}`;

let exists = true;
try {
  run("gh", ["release", "view", tag, "-R", REPO, "--json", "tagName"], { stdio: ["ignore", "pipe", "ignore"] });
} catch {
  exists = false;
}
if (exists) fail(`${tag} is already published; bump the version in plugin.json and the doc links`);

const latestBefore = run("gh", ["api", `repos/${REPO}/releases/latest`, "--jq", ".tag_name"]);
run("gh", [
  "release", "create", tag, ZIP,
  "-R", REPO,
  "--target", head,
  "--latest=false",
  "--title", `Claude plugin ${version}`,
  "--notes", `The Unilytics plugin for Claude, version ${version}. Upload unilytics-plugin.zip in Customize → Plugins, or add the marketplace https://github.com/${REPO}. Guide: docs/user/claude-plugin.md.`,
]);

// The download serves the file just built, and "latest" still points at the Desktop extension's release.
const downloaded = execFileSync("curl", ["-fsSL", `https://github.com/${REPO}/releases/download/${tag}/unilytics-plugin.zip`]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
if (sha(downloaded) !== sha(readFileSync(ZIP))) fail(`the ${tag} download doesn't match dist-plugin/unilytics-plugin.zip`);
const latestAfter = run("gh", ["api", `repos/${REPO}/releases/latest`, "--jq", ".tag_name"]);
if (latestAfter !== latestBefore) fail(`"latest" moved from ${latestBefore} to ${latestAfter}; set it back with gh release edit ${latestBefore} --latest`);
run("curl", ["-fsSLI", "-o", "/dev/null", `https://github.com/${REPO}/releases/latest/download/unilytics.mcpb`]);
console.log(`release-plugin: published ${tag} (sha256 ${sha(downloaded)}); latest is still ${latestAfter}`);
