#!/usr/bin/env node

// The README (also the npm page) names Unilytics tools, and those tools live on the server, not here. This fails when
// the README names a tool the live server no longer serves, so a rename or retirement can't leave the docs wrong again
// (UNI-126: npm showed 16 tools that had been retired for months).
//
// Uses a made-up key, like check-live-contract.mjs: tools/list answers before the key is checked, so this reaches no
// account and spends nothing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const URL = "https://mcp.unilytics.ai/mcp";
const README = new globalThis.URL("../README.md", import.meta.url);

const response = await fetch(URL, {
  method: "POST",
  headers: {
    Authorization: "Bearer ulk_test_contract_check_not_a_real_key",
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": "unilytics-mcp-readme-check",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});
assert.equal(response.status, 200, `tools/list: expected 200, got ${response.status}`);
const body = await response.json();
const tools = body.result?.tools;
assert.ok(Array.isArray(tools) && tools.length > 0, "tools/list: expected a non-empty tool list");
const live = new Set(tools.map((tool) => tool.name));

// A tool name in the README is written as inline code in snake_case, e.g. `find_skill`.
const readme = readFileSync(README, "utf8");
const named = new Set([...readme.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)].map((match) => match[1]));
assert.ok(named.size > 0, "README: expected it to name some tools");

const missing = [...named].filter((name) => !live.has(name)).sort();
assert.deepEqual(missing, [], `README names tools the live server doesn't serve: ${missing.join(", ")}`);

console.log(`README names ${named.size} tools; all ${named.size} are in the live tools/list (${live.size} tools).`);
