import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { handle } from "../src/mcp.ts";
import { registry } from "../src/registry.ts";
import { DOCTRINE_TOOL, MCP_PROTOCOL_VERSION } from "../src/config.ts";

const ROOT = join(import.meta.dirname, "..");
const FIXTURE = join(import.meta.dirname, "fixtures", "project");

function askIn(body: unknown, root: string): Record<string, unknown> {
  const reply = handle(registry(), root, JSON.stringify(body));
  assert.equal(reply.kind, "message");
  if (reply.kind !== "message") throw new Error("unreachable");
  const parsed: unknown = JSON.parse(reply.text);
  assert.ok(parsed !== null && typeof parsed === "object");
  return { ...parsed };
}

function resultOfIn(body: unknown, root: string): Record<string, unknown> {
  const held = askIn(body, root)["result"];
  assert.ok(held !== null && typeof held === "object");
  return { ...held };
}

function firstTextIn(body: unknown, root: string): string {
  const content = resultOfIn(body, root)["content"];
  assert.ok(Array.isArray(content));
  const block = content[0];
  assert.ok(block !== null && typeof block === "object" && "text" in block);
  const text = Object.getOwnPropertyDescriptor(block, "text")?.value;
  assert.equal(typeof text, "string");
  return String(text);
}

function ask(body: unknown): Record<string, unknown> {
  return askIn(body, ROOT);
}

function resultOf(body: unknown): Record<string, unknown> {
  return resultOfIn(body, ROOT);
}

function firstText(body: unknown): string {
  return firstTextIn(body, ROOT);
}


test("a client can complete the handshake", () => {
  const result = resultOf({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(result["protocolVersion"], MCP_PROTOCOL_VERSION);
});

test("the doctrine tool is advertised", () => {
  const tools = resultOf({ jsonrpc: "2.0", id: 2, method: "tools/list" })["tools"];
  assert.ok(Array.isArray(tools));
  assert.ok(
    tools.some((held) => held.name === DOCTRINE_TOOL),
    "the doctrine tool must be offered; other capabilities may offer their own",
  );
});

test("calling it with no argument lists what can be pulled", () => {
  const text = firstTextIn({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: DOCTRINE_TOOL, arguments: {} },
  }, FIXTURE);

  for (const branch of ["law", "process"]) {
    assert.ok(text.includes(branch), `${branch} was not offered`);
  }
});

test("pulling a branch by name returns canon and project merged", () => {
  const text = firstTextIn({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: DOCTRINE_TOOL, arguments: { branch: "law" } },
  }, FIXTURE);

  assert.ok(
    text.includes("A promise nobody waits for fails in silence"),
    "the canon half is missing",
  );
  assert.ok(text.includes("A fixture rule"), "the project half is missing");
  assert.ok(
    text.indexOf("A promise nobody waits") < text.indexOf("A fixture rule"),
    "the canon half must come first, with the project half added after it",
  );
});

test("a branch that does not exist says so and offers the real ones", () => {
  const text = firstText({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: DOCTRINE_TOOL, arguments: { branch: "nonsense" } },
  });

  assert.ok(text.includes('no rule set called "nonsense"'));
  assert.ok(text.includes("law"));
});

test("an unknown tool is an error the caller can read, never a crash", () => {
  const result = resultOf({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "delete_everything", arguments: {} },
  });

  assert.equal(result["isError"], true);
});

test("an unknown method is refused without killing the server", () => {
  const reply = ask({ jsonrpc: "2.0", id: 7, method: "resources/list" });
  const error = reply["error"];
  assert.ok(error !== null && typeof error === "object");
});

test("a notification gets no reply, and unparseable input is discarded", () => {
  assert.equal(
    handle(registry(), ROOT, JSON.stringify({ jsonrpc: "2.0", method: "ping" })).kind,
    "none",
  );
  const bad = handle(registry(), ROOT, "{ not json");
  assert.equal(bad.kind, "unreadable");
});
