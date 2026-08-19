import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { law } from "../src/commands/law.ts";
import { runInit } from "../src/init.ts";
import { INSTALLED } from "../src/config.ts";
import { gitIn as git } from "./helpers.ts";

const NO_PATH: readonly string[] = [];

function projectWithSomethingUnreadable(): string {
  const outside = mkdtempSync(join(tmpdir(), "looper-outside-"));
  writeFileSync(join(outside, "elsewhere.ts"), "export const n = 1;\n");
  const root = mkdtempSync(join(tmpdir(), "looper-unread-"));
  mkdirSync(join(root, "src"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(join(root, "src/a.ts"), "export function f(x) { return x || 0; }\n");
  symlinkSync(join(outside, "elsewhere.ts"), join(root, "src/away.ts"));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "first");
  runInit(root, INSTALLED, NO_PATH);
  return root;
}

test("a report that found problems still says how much it could not read", () => {
  const root = projectWithSomethingUnreadable();
  const wasIn = process.cwd();
  try {
    process.chdir(root);
    const out: string[] = [];
    law(NO_PATH, { say: (line) => out.push(line), warn: (line) => out.push(line) });
    const spoken = out.join("\n");
    const parts = spoken.split("looper found");
    const afterTheReport = parts.length > 1 ? parts.slice(1).join("looper found") : "";

    assert.ok(
      afterTheReport.length > 0 && /could not be read/.test(afterTheReport),
      `adopter issue #111: a calibration table was published over 71% of a codebase because 2,425 files could not be parsed and the summary never said so. A count of what was not read belongs beside the count of what was found, not only in the case where nothing was found.\n${spoken}`,
    );
  } finally {
    process.chdir(wasIn);
    rmSync(root, { recursive: true, force: true });
  }
});
