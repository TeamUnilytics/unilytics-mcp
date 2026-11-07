import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";

import { request, startBridge, startServer, TEST_KEY } from "./harness.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

let server;
let bridges;
const bridgeFor = (options = {}) => {
  const bridge = startBridge({ url: server.url, ...options });
  bridges.push(bridge);
  return bridge;
};

beforeEach(async () => {
  server = await startServer();
  bridges = [];
});
afterEach(async () => {
  await Promise.all(bridges.map((bridge) => bridge.stop()));
  await server.close();
});

const ERROR_API_KEY = -32010;
const ERROR_TRANSPORT_FAILED = -32011;
const ERROR_REQUEST_REFUSED = -32012;

test("forwards a request and sends the key and version", async () => {
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/list"));
  assert.deepEqual((await bridge.reply(1)).result, { echoed: "tools/list" });

  const { headers } = server.requests.find((r) => r.method === "POST");
  assert.equal(headers.authorization, `Bearer ${TEST_KEY}`);
  assert.equal(headers["user-agent"], `unilytics-mcp-bridge/${pkg.version}`);
});

test("keeps request ids intact, including 0 and an empty string", async () => {
  const bridge = bridgeFor();
  bridge.send(request(0, "tools/list"));
  bridge.send(request("", "tools/list"));
  assert.equal((await bridge.reply(0)).id, 0);
  assert.equal((await bridge.reply("")).id, "");
});

test("matches concurrent replies to their requests", async () => {
  const bridge = bridgeFor();
  server.respond = (req, body, res) => {
    // Later requests answer first.
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { n: body.params.n } }));
    }, 100 - body.params.n * 20);
  };
  const ids = [1, 2, 3, 4];
  for (const n of ids) bridge.send(request(n, "tools/call", { n }));
  for (const n of ids) assert.equal((await bridge.reply(n)).result.n, n);
});

test("passes a server tool error through unchanged", async () => {
  const toolError = { content: [{ type: "text", text: "Invalid or revoked API key." }], isError: true };
  server.respond = (req, body, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: toolError }));
  };
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/call", { name: "list_projects" }));
  assert.deepEqual((await bridge.reply(1)).result, toolError);
});

test("HTTP 401 says how to replace the key and the bridge stays up", async () => {
  server.respond = (req, body, res) => res.writeHead(401).end("nope");
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/call", { name: "list_projects" }));
  const { error } = await bridge.reply(1);
  assert.equal(error.code, ERROR_API_KEY);
  assert.match(error.message, /app\.unilytics\.ai\/settings\/api-keys/);
  assert.match(error.message, /Settings → Extensions → Unilytics → Configure/);

  server.respond = null;
  bridge.send(request(2, "tools/list"));
  assert.deepEqual((await bridge.reply(2)).result, { echoed: "tools/list" });
});

test("HTTP 403 says it did not run and doesn't blame the key outright", async () => {
  server.respond = (req, body, res) => res.writeHead(403).end("blocked by proxy");
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/call", { name: "list_projects" }));
  const { error } = await bridge.reply(1);
  assert.equal(error.code, ERROR_REQUEST_REFUSED);
  assert.match(error.message, /HTTP 403/);
  assert.match(error.message, /did not run/);
  assert.match(error.message, /proxy or firewall/);
  assert.doesNotMatch(error.message, /didn't accept/);
});

test("HTTP 429 says wait, not that the connection failed", async () => {
  server.respond = (req, body, res) => res.writeHead(429).end();
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/call", { name: "x" }));
  const { error } = await bridge.reply(1);
  assert.equal(error.code, ERROR_REQUEST_REFUSED);
  assert.match(error.message, /did not run/);
  assert.match(error.message, /Wait a minute/);
});

test("a failed tool call warns that it may have run, and never says to just retry", async () => {
  server.respond = (req, body, res) => res.writeHead(504).end("gateway timeout");
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/call", { name: "site_crawl" }));
  const { error } = await bridge.reply(1);
  assert.equal(error.code, ERROR_TRANSPORT_FAILED);
  assert.match(error.message, /may or may not have finished/);
  assert.match(error.message, /credits/);
  assert.doesNotMatch(error.message, /try again/i);
  assert.equal(server.requests.filter((r) => r.body?.id === 1).length, 1, "must not be retried");
});

test("a failed read says to try again", async () => {
  server.respond = (req, body, res) => res.writeHead(500).end();
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/list"));
  const { error } = await bridge.reply(1);
  assert.equal(error.code, ERROR_TRANSPORT_FAILED);
  assert.match(error.message, /try again/);
});

test("an unreachable server gives an error and the bridge recovers when it comes back", async () => {
  const blackout = await startServer();
  const url = blackout.url;
  const port = blackout.http.address().port;
  await blackout.close();

  const bridge = bridgeFor({ url });
  bridge.send(request(1, "initialize"));
  assert.equal((await bridge.reply(1)).error.code, ERROR_TRANSPORT_FAILED);
  assert.match(bridge.stderr, /cause=ECONNREFUSED/);

  const back = createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: JSON.parse(text).id, result: { back: true } }));
    });
  });
  await new Promise((resolve) => back.listen(port, "127.0.0.1", resolve));
  try {
    bridge.send(request(2, "initialize"));
    assert.deepEqual((await bridge.reply(2)).result, { back: true });
  } finally {
    back.closeAllConnections();
    await new Promise((resolve) => back.close(resolve));
  }
});

test("a failed notification gets no reply and doesn't stop the bridge", async () => {
  server.respond = (req, body, res) => res.writeHead(500).end();
  const bridge = bridgeFor();
  bridge.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(bridge.messages, []);

  server.respond = null;
  bridge.send(request(2, "tools/list"));
  assert.deepEqual((await bridge.reply(2)).result, { echoed: "tools/list" });
});

test("a failed response gets no reply", async () => {
  server.respond = (req, body, res) => res.writeHead(500).end();
  const bridge = bridgeFor();
  bridge.send({ jsonrpc: "2.0", id: 7, result: {} });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(bridge.messages, []);
});

test("an unreadable line from the client doesn't stop the bridge", async () => {
  const bridge = bridgeFor();
  bridge.child.stdin.write("not json\n");
  bridge.send(request(1, "tools/list"));
  assert.deepEqual((await bridge.reply(1)).result, { echoed: "tools/list" });
});

test("the key never reaches stdout or stderr, even when the server reflects it", async () => {
  server.respond = (req, body, res) => res.writeHead(500).end(`bad: ${req.headers.authorization}`);
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/call", { name: "x" }));
  await bridge.reply(1);
  server.respond = (req, body, res) => res.writeHead(401).end(`bad: ${req.headers.authorization}`);
  bridge.send(request(2, "tools/list"));
  await bridge.reply(2);
  assert.ok(!bridge.stderr.includes(TEST_KEY), bridge.stderr);
  assert.ok(!bridge.stdout.includes(TEST_KEY), bridge.stdout);
});

test("a redirect to another origin is refused, so the key never goes there", async () => {
  const other = await startServer();
  try {
    // A different port is a different origin.
    server.respond = (req, body, res) => res.writeHead(307, { Location: other.url }).end();
    const bridge = bridgeFor();
    bridge.send(request(1, "tools/list"));
    assert.equal((await bridge.reply(1)).error.code, ERROR_TRANSPORT_FAILED);
    assert.equal(other.requests.length, 0);
  } finally {
    other.http.closeAllConnections();
    await other.close();
  }
});

test("a pasted key is trimmed", async () => {
  const bridge = bridgeFor({ key: `  ${TEST_KEY}\n` });
  bridge.send(request(1, "tools/list"));
  await bridge.reply(1);
  assert.equal(server.requests[0].headers.authorization, `Bearer ${TEST_KEY}`);
});

test("--api-key= works and keeps an = inside the key", async () => {
  const bridge = bridgeFor({ key: null, args: ["--api-key=ulk_test_a=b"] });
  bridge.send(request(1, "tools/list"));
  await bridge.reply(1);
  assert.equal(server.requests[0].headers.authorization, "Bearer ulk_test_a=b");
});

for (const [name, key, expected] of [
  ["missing", null, /No Unilytics API key is set/],
  ["blank", "   ", /No Unilytics API key is set/],
  ["line-broken", "ulk_test_first\nsecond_half", /copied incompletely/],
]) {
  test(`a ${name} key is explained in the chat, not only in a log file`, async () => {
    const bridge = bridgeFor({ key });
    bridge.send(request(1, "initialize"));
    bridge.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    bridge.send(request(2, "tools/call", { name: "list_projects" }));

    for (const id of [1, 2]) {
      const { error } = await bridge.reply(id);
      assert.equal(error.code, ERROR_API_KEY);
      assert.match(error.message, expected);
      assert.match(error.message, /app\.unilytics\.ai\/settings\/api-keys/);
    }
    assert.equal(bridge.messages.length, 2, "a notification gets no reply");
    assert.equal(server.requests.length, 0, "nothing is sent to the server");
    assert.match(bridge.stderr, expected);
    assert.ok(!(bridge.stdout + bridge.stderr).includes("second_half"), "the key is never echoed");

    bridge.child.stdin.end();
    assert.equal(await bridge.exited, 1);
  });
}

for (const url of ["http://mcp.example.com/mcp", "ftp://127.0.0.1/mcp", "not a url"]) {
  test(`refuses UNILYTICS_MCP_URL=${url}`, async () => {
    const bridge = bridgeFor({ url });
    assert.equal(await bridge.exited, 1);
    assert.match(bridge.stderr, /UNILYTICS_MCP_URL/);
  });
}

test("exits 0 when the client closes stdin", async () => {
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/list"));
  await bridge.reply(1);
  bridge.child.stdin.end();
  assert.equal(await bridge.exited, 0);
});

test("a reply still on its way when the client closes stdin is delivered before exit", async () => {
  server.respond = (req, body, res) => {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { late: true } }));
    }, 150);
  };
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/call", { name: "x" }));
  while (!server.requests.length) await new Promise((resolve) => setTimeout(resolve, 10));
  bridge.child.stdin.end();
  assert.equal(await bridge.exited, 0);
  assert.deepEqual(bridge.messages.find((m) => m.id === 1)?.result, { late: true });
});

test("exits 0 on SIGTERM with a request in flight", { skip: process.platform === "win32" }, async () => {
  server.respond = () => {}; // never answers
  const bridge = bridgeFor();
  bridge.send(request(1, "tools/call", { name: "site_crawl" }));
  while (!server.requests.length) await new Promise((resolve) => setTimeout(resolve, 10));
  bridge.child.kill("SIGTERM");
  assert.equal(await bridge.exited, 0);
  server.http.closeAllConnections();
});
