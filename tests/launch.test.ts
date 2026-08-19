import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEV, INSTALLED, LOCAL, SHIM, entryFor, inside, launchFor, mcpStub, type Invocation } from "../src/config.ts";
import { entryReach } from "../src/init.ts";

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

test("no argument in the mcp entry names a shell variable", () => {
  for (const invocation of [INSTALLED, LOCAL, DEV, inside("vendor/looper")]) {
    const entry = parsed(invocation);
    const args = entry["args"];
    assert.ok(Array.isArray(args));
    for (const word of [entry["command"], ...args]) {
      assert.ok(
        !String(word).includes("$"),
        `an argv entry is handed to the process exactly as written, so ${String(word)} is a filename with a dollar sign in it. No shell runs here to expand it, and the variable the hook lines use is not in the environment the agent expands this file from.`,
      );
    }
  }
});

test("the file the mcp entry names is the file init proved was there", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-launch-"));
  try {
    const at = "vendor/looper";
    mkdirSync(join(root, at, "bin"), { recursive: true });
    mkdirSync(join(root, at, "node_modules"), { recursive: true });
    writeFileSync(join(root, at, SHIM), "");

    assert.equal(entryReach(root, inside(at), []).kind, "reachable");

    const args = parsed(inside(at))["args"];
    assert.ok(Array.isArray(args));
    assert.ok(
      existsSync(join(root, String(args[0]))),
      `init checked one path and wrote another: ${String(args[0])} is not a file under the project root the entry was written for.`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
