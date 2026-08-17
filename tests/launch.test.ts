import { test } from "node:test";
import assert from "node:assert/strict";

import { DEV, INSTALLED, entryFor, inside, launchFor, mcpStub, type Invocation } from "../src/config.ts";

function parsed(invocation: Invocation): Record<string, unknown> {
  const value: unknown = JSON.parse(mcpStub(invocation));
  assert.ok(value !== null && typeof value === "object");
  const servers = Object.getOwnPropertyDescriptor(value, "mcpServers")?.value;
  assert.ok(servers !== null && typeof servers === "object");
  const entry = Object.getOwnPropertyDescriptor(servers, "looper")?.value;
  assert.ok(entry !== null && typeof entry === "object");
  return { ...entry };
}

test("no argument in the mcp entry carries a quote character", () => {
  for (const invocation of [INSTALLED, DEV, inside("vendor/looper")]) {
    const args = parsed(invocation)["args"];
    assert.ok(Array.isArray(args));
    for (const arg of args) {
      assert.ok(
        !String(arg).includes('"'),
        `an argv entry is passed to the process exactly as written, so a quote in ${String(arg)} becomes part of the filename. Quoting belongs in a shell command line, never in an argument list.`,
      );
    }
  }
});

test("the hook command is a shell line and does quote its path", () => {
  assert.ok(entryFor(DEV).includes('"'));
  assert.equal(entryFor(INSTALLED), "looper");
});

test("both forms end up asking for the same thing", () => {
  for (const invocation of [INSTALLED, DEV, inside("vendor/looper")]) {
    const args = parsed(invocation)["args"];
    assert.ok(Array.isArray(args));
    assert.equal(args[args.length - 1], "serve");
    assert.equal(parsed(invocation)["type"], "stdio");
  }
});

test("the installed form is a bare command with nothing machine-specific", () => {
  const launch = launchFor(INSTALLED);
  assert.equal(launch.command, "looper");
  assert.deepEqual([...launch.args], []);
});
