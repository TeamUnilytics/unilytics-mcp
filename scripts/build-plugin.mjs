// Builds dist-plugin/unilytics-plugin.zip: the Claude plugin in plugins/unilytics, for Customize → Plugins → Upload plugin
// on claude.ai and the Claude apps (UNI-1363). The archive holds the plugin's contents at its top level, with one
// .claude-plugin/plugin.json, as claude.ai accepts.
//
// Standard library only. The zip is deterministic (sorted entries, fixed timestamps, no extra fields), so the same
// commit always gives the same bytes and a release can be checked against a rebuild.
//
//   node scripts/build-plugin.mjs            build
//   node scripts/build-plugin.mjs --check    build, then re-read the archive and check it
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(ROOT, "plugins", "unilytics");
const OUT_DIR = join(ROOT, "dist-plugin");
const OUT = join(OUT_DIR, "unilytics-plugin.zip");
const SERVER_URL = "https://mcp.unilytics.ai/mcp";
// claude.ai's limits: 5,000 files and 200 MB per plugin. Ours is a few KB; a big jump means something wrong got in.
const MAX_FILES = 50;
const MAX_BYTES = 1024 * 1024;

function fail(message) {
  console.error(`build-plugin: ${message}`);
  process.exit(1);
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name === ".DS_Store") continue;
    if (entry.isSymbolicLink()) fail(`${relative(ROOT, full)} is a symlink; plugins must hold real files`);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// The checks claude.ai and the docs don't make for us: the connector is ours, and no key or header is in a file.
function checkPlugin() {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8"));
  if (manifest.name !== "unilytics") fail(`plugin.json name is ${manifest.name}, expected unilytics`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) fail("plugin.json version must be X.Y.Z");

  const mcp = JSON.parse(readFileSync(join(PLUGIN, ".mcp.json"), "utf8"));
  const servers = Object.entries(mcp.mcpServers ?? {});
  if (servers.length !== 1) fail(".mcp.json must hold exactly one server, unilytics");
  const [name, server] = servers[0];
  const keys = Object.keys(server).sort().join(",");
  if (name !== "unilytics" || server.type !== "http" || server.url !== SERVER_URL || keys !== "type,url") {
    fail(`.mcp.json must be {"unilytics": {"type": "http", "url": "${SERVER_URL}"}} and nothing else (sign-in is OAuth)`);
  }

  const market = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
  const entry = market.plugins.find((p) => p.name === "unilytics");
  if (!entry || entry.source !== "./plugins/unilytics") fail("marketplace.json must list unilytics at ./plugins/unilytics");
  return manifest.version;
}

// CRC-32 (IEEE), for Node 18, which has no zlib.crc32.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00, the earliest DOS date: a fixed timestamp keeps the build reproducible.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, so the mode below is read
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // regular file, rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// Re-reads the archive from its central directory and compares every entry with the source file.
function checkZip(zip, entries) {
  const endAt = zip.length - 22;
  if (zip.readUInt32LE(endAt) !== 0x06054b50) fail("zip: no end-of-central-directory record");
  const count = zip.readUInt16LE(endAt + 10);
  if (count !== entries.length) fail(`zip: ${count} entries, expected ${entries.length}`);
  let at = zip.readUInt32LE(endAt + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) fail("zip: bad central directory entry");
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    const localNameLen = zip.readUInt16LE(localAt + 26);
    const dataAt = localAt + 30 + localNameLen + zip.readUInt16LE(localAt + 28);
    const data = inflateRawSync(zip.subarray(dataAt, dataAt + size));
    const source = entries.find((e) => e.name === name);
    if (!source || !data.equals(source.data)) fail(`zip: ${name} doesn't match its source file`);
    names.push(name);
    at += 46 + nameLen + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  if (names.filter((n) => n === ".claude-plugin/plugin.json").length !== 1) {
    fail("zip: must hold exactly one .claude-plugin/plugin.json, at the top level");
  }
  if (names.some((n) => n.startsWith("/") || n.split("/").includes(".."))) fail("zip: unsafe path");
}

const version = checkPlugin();
const files = listFiles(PLUGIN).map((full) => relative(PLUGIN, full).split(sep).join("/")).sort();
if (files.length > MAX_FILES) fail(`${files.length} files, more than ${MAX_FILES}: check what got into plugins/unilytics`);
const entries = files.map((name) => {
  const full = join(PLUGIN, name);
  if (statSync(full).size > MAX_BYTES) fail(`${name} is over ${MAX_BYTES} bytes`);
  return { name, data: readFileSync(full) };
});
const zip = buildZip(entries);
if (process.argv.includes("--check")) checkZip(zip, entries);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, zip);
const sha256 = createHash("sha256").update(zip).digest("hex");
console.log(`build-plugin: ${relative(ROOT, OUT)} · plugin v${version} · ${entries.length} files · ${zip.length} bytes · sha256 ${sha256}`);
for (const name of files) console.log(`  ${name}`);
