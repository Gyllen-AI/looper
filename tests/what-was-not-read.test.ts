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

function projectWithAFileThatWillNotParse(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-noparse-"));
  mkdirSync(join(root, "src"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(join(root, "src/a.ts"), "export function f(x) { return x || 0; }\n");
  writeFileSync(join(root, "src/broken.ts"), "export const broken = (\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "first");
  runInit(root, INSTALLED, NO_PATH);
  return root;
}

test("a file that opens and will not parse is counted among what was not read", () => {
  const root = projectWithAFileThatWillNotParse();
  const wasIn = process.cwd();
  try {
    process.chdir(root);
    const out: string[] = [];
    law(NO_PATH, { say: (line) => out.push(line), warn: (line) => out.push(line) });
    const spoken = out.join("\n");

    assert.match(
      spoken,
      /A further 1 file\(s\) could not be read at all/,
      `adopter issue #115: TS-ERROR:8 fires for a file that opens and cannot be parsed, but the count of what was not read is built only from filesystem failures and the Python reader, so this file arrives as an ordinary finding and the summary stays silent. It is the case that caused #111.\n${spoken}`,
    );
    assert.match(
      spoken,
      /over the 1 that could be/,
      `the count of what was judged must exclude the file no rule could read, or the sentence overstates its own coverage.\n${spoken}`,
    );
  } finally {
    process.chdir(wasIn);
    rmSync(root, { recursive: true, force: true });
  }
});
