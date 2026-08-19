import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { declaredIn, LOOP_FILE } from "../src/loop/checks.ts";
import { ask, tallyOf, BLIND_EXIT, type Seen } from "../src/loop/run.ts";

function project(loopToml: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "looper-loop-"));
  mkdirSync(join(root, ".looper"), { recursive: true });
  if (loopToml !== null) writeFileSync(join(root, LOOP_FILE), loopToml);
  return root;
}

test("a project that declares nothing is not an error", () => {
  const root = project(null);
  const declared = declaredIn(root);
  assert.equal(declared.checks.length, 0);
  assert.equal(declared.complaints.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test("the section name is the label, so a label cannot be written twice", () => {
  const root = project(`[loop.one]\nreach = "internal"\nrun = "true"\n\n[loop.one]\nreach = "external"\nrun = "false"\n`);
  const declared = declaredIn(root);
  const labels = declared.checks.map((one) => one.label);
  assert.deepEqual(new Set(labels).size, labels.length);
  rmSync(root, { recursive: true, force: true });
});

test("a check with no reach is refused rather than guessed at", () => {
  const root = project(`[loop.nothing]\nrun = "true"\n`);
  const declared = declaredIn(root);
  assert.equal(declared.checks.length, 0);
  assert.match(declared.complaints[0] ?? "", /reach/);
  rmSync(root, { recursive: true, force: true });
});

test("exit zero is ok and its first line of output is the detail", () => {
  const root = project(null);
  const seen = ask({ label: "loop.t", reach: "internal", run: "echo all good" }, root, 10);
  assert.equal(seen.verdict, "ok");
  assert.equal(seen.detail, "all good");
  rmSync(root, { recursive: true, force: true });
});

test("a non-zero exit is broken", () => {
  const root = project(null);
  const seen = ask({ label: "loop.t", reach: "internal", run: "echo went wrong; exit 1" }, root, 10);
  assert.equal(seen.verdict, "broken");
  rmSync(root, { recursive: true, force: true });
});

test("an external check can say it could not be asked, and that is blind", () => {
  const root = project(null);
  const seen = ask({ label: "loop.t", reach: "external", run: `echo host is down; exit ${BLIND_EXIT}` }, root, 10);
  assert.equal(seen.verdict, "blind");
  rmSync(root, { recursive: true, force: true });
});

test("an internal check cannot be blind, because nothing it needs can be unreachable", () => {
  const root = project(null);
  const seen = ask({ label: "loop.t", reach: "internal", run: `exit ${BLIND_EXIT}` }, root, 10);
  assert.equal(seen.verdict, "broken");
  rmSync(root, { recursive: true, force: true });
});

test("blind is counted apart from broken and never as ok", () => {
  const seen: readonly Seen[] = [
    { label: "a", reach: "internal", verdict: "ok", detail: "", millis: 1 },
    { label: "b", reach: "external", verdict: "blind", detail: "", millis: 1 },
    { label: "c", reach: "internal", verdict: "broken", detail: "", millis: 1 },
  ];
  const tally = tallyOf(seen);
  assert.equal(tally.ok, 1);
  assert.equal(tally.broken, 1);
  assert.equal(tally.blind, 1);
  assert.deepEqual([...tally.failing], ["b", "c"]);
});
