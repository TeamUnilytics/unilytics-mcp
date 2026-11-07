#!/usr/bin/env node

// What installed bridges rely on and can't be updated to stop relying on (README, "Keep old bridges working"):
// the permanent host answers each POST with one JSON response, not an SSE stream or a bare 202.
//
// Uses a made-up key, so it reaches no account and spends nothing. tools/call is the case that matters: it's the one
// that could move to streaming, and a bad key is rejected inside the same route with a tool error.

import assert from "node:assert/strict";

const URL = "https://mcp.unilytics.ai/mcp";

async function post(id, method, params = {}) {
  const response = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer ulk_test_contract_check_not_a_real_key",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "unilytics-mcp-contract-check",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert.equal(response.status, 200, `${method}: expected 200, got ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/, `${method}: expected a JSON response`);
  const body = await response.json();
  assert.equal(body.id, id, `${method}: expected the reply to carry the request id`);
  return body;
}

const init = await post(1, "initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "unilytics-mcp-contract-check", version: "1" },
});
assert.ok(init.result?.serverInfo, "initialize: expected serverInfo");

const list = await post(2, "tools/list");
assert.ok(
  list.result?.tools?.some((tool) => tool.name === "list_projects"),
  "tools/list: expected list_projects"
);

const call = await post(3, "tools/call", { name: "list_projects", arguments: {} });
assert.equal(call.result?.isError, true, "tools/call: a made-up key must be refused");
assert.match(call.result.content[0].text, /invalid_api_key/, "tools/call: the Authorization header must reach the server");

console.log(`${URL} keeps the contract: JSON replies, ${list.result.tools.length} tools, and the key header arrives.`);
