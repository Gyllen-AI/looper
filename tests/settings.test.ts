import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeSettings } from "../src/settings.ts";
import { SettingsUnparseable, SettingsNotAnObject } from "../src/errors.ts";
import type { HookSpec } from "../src/types.ts";

const OURS: readonly HookSpec[] = [
  {
    event: "UserPromptSubmit",
    matcher: { kind: "all" },
    command: "looper inject",
  },
  {
    event: "PostToolUse",
    matcher: { kind: "match", pattern: "Edit|MultiEdit|Write" },
    command: "looper hook PostToolUse",
  },
];

const FOREIGN = {
  hooks: {
    PostToolUse: [
      {
        matcher: "Bash",
        hooks: [{ type: "command", command: "their-linter --check" }],
      },
    ],
  },
  permissions: { allow: ["Bash(npm test)"] },
};

function present(value: unknown): { kind: "present"; text: string } {
  return { kind: "present", text: `${JSON.stringify(value, null, 2)}\n` };
}

function parse(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return { ...value };
}

test("an absent settings file is created with our hooks", () => {
  const result = mergeSettings({ kind: "absent" }, OURS);

  assert.equal(result.kind, "created");
  if (result.kind !== "created") return;
  assert.deepEqual([...result.wired], [
    "looper inject",
    "looper hook PostToolUse",
  ]);
});

test("a foreign hook survives the merge untouched", () => {
  const result = mergeSettings(present(FOREIGN), OURS);

  assert.equal(result.kind, "merged");
  if (result.kind !== "merged") return;

  const merged = parse(result.text);
  const hooks = merged["hooks"];
  assert.ok(hooks !== null && typeof hooks === "object");

  const commands = JSON.stringify(hooks);
  assert.ok(commands.includes("their-linter --check"));
  assert.ok(commands.includes("looper hook PostToolUse"));
  assert.ok(commands.includes("looper inject"));
});

test("the foreign matcher group keeps its own shape", () => {
  const result = mergeSettings(present(FOREIGN), OURS);
  assert.equal(result.kind, "merged");
  if (result.kind !== "merged") return;

  const merged = parse(result.text);
  const events = merged["hooks"];
  assert.ok(events !== null && typeof events === "object" && !Array.isArray(events));

  const groups = Object.getOwnPropertyDescriptor(events, "PostToolUse")?.value;
  assert.ok(Array.isArray(groups));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    matcher: "Bash",
    hooks: [{ type: "command", command: "their-linter --check" }],
  });
});

test("keys we do not own are left alone", () => {
  const result = mergeSettings(present(FOREIGN), OURS);
  assert.equal(result.kind, "merged");
  if (result.kind !== "merged") return;

  const merged = parse(result.text);
  assert.deepEqual(merged["permissions"], { allow: ["Bash(npm test)"] });
});

test("twice is indistinguishable from once", () => {
  const first = mergeSettings(present(FOREIGN), OURS);
  assert.equal(first.kind, "merged");
  if (first.kind !== "merged") return;

  const second = mergeSettings({ kind: "present", text: first.text }, OURS);
  assert.equal(second.kind, "unchanged");
});

test("a file already carrying our hooks is unchanged, not rewritten", () => {
  const created = mergeSettings({ kind: "absent" }, OURS);
  assert.equal(created.kind, "created");
  if (created.kind !== "created") return;

  const again = mergeSettings({ kind: "present", text: created.text }, OURS);
  assert.equal(again.kind, "unchanged");
});

test("our hook joins an existing group with the same matcher", () => {
  const sameMatcher = {
    hooks: {
      PostToolUse: [
        {
          matcher: "Edit|MultiEdit|Write",
          hooks: [{ type: "command", command: "their-formatter" }],
        },
      ],
    },
  };

  const result = mergeSettings(present(sameMatcher), OURS);
  assert.equal(result.kind, "merged");
  if (result.kind !== "merged") return;

  const merged = parse(result.text);
  const events = merged["hooks"];
  assert.ok(events !== null && typeof events === "object");
  const groups = Object.getOwnPropertyDescriptor(events, "PostToolUse")?.value;
  assert.ok(Array.isArray(groups));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].hooks.length, 2);
  assert.equal(groups[0].hooks[0].command, "their-formatter");
});

test("unparseable settings refuse loudly and never overwrite", () => {
  assert.throws(
    () => mergeSettings({ kind: "present", text: "{ not json" }, OURS),
    SettingsUnparseable,
  );
});

test("settings that are not an object refuse loudly", () => {
  assert.throws(
    () => mergeSettings({ kind: "present", text: "[1, 2, 3]" }, OURS),
    SettingsNotAnObject,
  );
});
