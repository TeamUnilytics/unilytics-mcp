#!/usr/bin/env node

// The README (also the npm page) and the .mcpb manifest (Claude Desktop's install screen) name Unilytics tools, and
// those tools live on the server, not here. This fails when either names a tool the live server no longer serves, so
// a rename or retirement can't leave them wrong again (UNI-126: npm showed 16 tools retired months earlier).
// It runs on every PR and weekly (.github/workflows/docs-tools.yml), not in a release: a server-side rename must not
// block a bridge fix from shipping.
//
// Uses a made-up key, like check-live-contract.mjs: tools/list answers before the key is checked, so this reaches no
// account and spends nothing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ENDPOINT = "https://mcp.unilytics.ai/mcp";
const README = new URL("../README.md", import.meta.url);
const MANIFEST = new URL("../mcpb/manifest.json", import.meta.url);
const PLUGIN_SKILL = new URL("../plugins/unilytics/skills/use-unilytics/SKILL.md", import.meta.url);

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    Authorization: "Bearer ulk_test_contract_check_not_a_real_key",
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": "unilytics-mcp-docs-check",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  signal: AbortSignal.timeout(30_000),
});
assert.equal(response.status, 200, `tools/list: expected 200, got ${response.status}`);
const body = await response.json();
const tools = body.result?.tools;
assert.ok(Array.isArray(tools) && tools.length > 0, "tools/list: expected a non-empty tool list");
const live = new Set(tools.map((tool) => tool.name));
// Every argument name a live tool takes, e.g. `project_id`: the plugin's skill names them as well as tools.
const liveArguments = new Set(tools.flatMap((tool) => Object.keys(tool.inputSchema?.properties ?? {})));

function check(where, names, served = live) {
  assert.ok(names.size > 0, `${where}: expected it to name some tools`);
  const missing = [...names].filter((name) => !served.has(name)).sort();
  assert.deepEqual(missing, [], `${where} names tools the live server doesn't serve: ${missing.join(", ")}`);
  console.log(`${where}: all ${names.size} tools it names are in the live tools/list (${live.size} tools).`);
}

// In the README and the plugin's skill a tool name is inline code in snake_case, e.g. `find_skill`.
const inlineTools = (text) => new Set([...text.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)].map((match) => match[1]));
check("README.md", inlineTools(readFileSync(README, "utf8")));
// The Claude plugin's skill (UNI-1363) tells the AI which tools to call, so a renamed tool would break every first run.
// It names their arguments too, so there a name passes if it is a live tool or an argument one of them takes.
check(
  "plugins/unilytics/skills/use-unilytics/SKILL.md",
  inlineTools(readFileSync(PLUGIN_SKILL, "utf8")),
  new Set([...live, ...liveArguments]),
);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
check("mcpb/manifest.json", new Set((manifest.tools ?? []).map((tool) => tool.name)));
