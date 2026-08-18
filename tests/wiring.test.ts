import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INSTALLED } from "../src/config.ts";
import { runInit } from "../src/init.ts";

const NO_PATH: readonly string[] = [];

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "looper-wiring-"));
}

test("a hook looper wrote with an older entry is rewired, not doubled", () => {
  const root = scratch();
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude/settings.json"),
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'node "$CLAUDE_PROJECT_DIR/src/main.ts" hook PreToolUse' },
                  { type: "command", command: "their-own-checker" },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    runInit(root, INSTALLED, NO_PATH);
    const held: unknown = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
    const hooks = Object.getOwnPropertyDescriptor(held, "hooks")?.value;
    const groups = Object.getOwnPropertyDescriptor(hooks, "PreToolUse")?.value;
    const commands: string[] = [];
    for (const group of groups) {
      for (const one of Object.getOwnPropertyDescriptor(group, "hooks")?.value) {
        commands.push(Object.getOwnPropertyDescriptor(one, "command")?.value);
      }
    }

    assert.equal(
      commands.filter((one) => one.includes("hook PreToolUse")).length,
      1,
      `looper is now wired twice for one event and runs twice on every tool call: ${JSON.stringify(commands)}`,
    );
    assert.ok(
      commands.includes("their-own-checker"),
      "a hook this project wrote was removed by a repair that should only ever touch looper's own",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
