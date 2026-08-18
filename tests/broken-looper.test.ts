import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEV, entryFor } from "../src/config.ts";

const SHIM = fileURLToPath(new URL("../bin/looper.js", import.meta.url));

function brokenCheckout(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-broken-"));
  mkdirSync(join(root, "bin"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  copyFileSync(SHIM, join(root, "bin", "looper.js"));
  writeFileSync(join(root, "src", "main.ts"), "export const held: = ;\n");
  return root;
}

test("a looper that cannot even load says so to the agent, and lets the turn through", () => {
  const root = brokenCheckout();
  try {
    const ran = spawnSync(process.execPath, [join(root, "bin", "looper.js"), "hook", "PreToolUse"], {
      encoding: "utf8",
      input: '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}',
    });

    assert.equal(
      ran.status,
      0,
      "a looper that cannot load must not wedge the session it watches",
    );

    const said: unknown = JSON.parse(ran.stdout.trim());
    const held = Object.getOwnPropertyDescriptor(said, "hookSpecificOutput")?.value;
    const context = Object.getOwnPropertyDescriptor(held, "additionalContext")?.value;

    assert.equal(
      typeof context,
      "string",
      `the only reader who must know looper stopped judging is the agent still writing, and it reads additionalContext: ${ran.stdout} ${ran.stderr}`,
    );
    if (typeof context !== "string") return;
    assert.ok(
      context.includes("not judging"),
      `the message has to say plainly that nothing is being checked: ${context}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every hook goes through the one entry that cannot fail", () => {
  assert.ok(
    entryFor(DEV).includes("bin/looper.js"),
    "a hook wired straight at src/main.ts dies on its own imports, and nothing downstream can announce that",
  );
});
