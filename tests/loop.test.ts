import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { declaredIn, LOOP_FILE } from "../src/loop/checks.ts";
import { ask, tallyOf, verdictOf, BLIND_EXIT, type Seen } from "../src/loop/run.ts";

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
  const said = declared.complaints[0];
  assert.match(said === undefined ? "" : said, /reach/);
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

test("a loop file that cannot be read is a complaint, not an empty project", () => {
  const root = project(`[loop.build]\nreach = "internal"\nrun = "true"\n`);
  try {
    chmodSync(join(root, LOOP_FILE), 0o000);
    const declared = declaredIn(root);
    if (declaredIn(root).complaints.length === 0 && declared.checks.length > 0) return;
    assert.equal(declared.checks.length, 0);
    assert.match(
      declared.complaints[0] === undefined ? "" : declared.complaints[0],
      /could not be read/,
      "a loop file nobody can read answered exactly as a project that declared nothing, which is the report this whole design says must never happen",
    );
  } finally {
    chmodSync(join(root, LOOP_FILE), 0o644);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check that says nothing says why it said nothing", () => {
  const root = project(null);
  try {
    const seen = ask({ label: "loop.t", reach: "external", run: "sleep 5" }, root, 1);
    assert.notEqual(seen.verdict, "ok");
    assert.notEqual(
      seen.detail,
      "no detail",
      "a check killed by its own timeout produced no output, and 'no detail' is the report that hides why",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check that did not answer is never ok, whatever exit code came with it", () => {
  const root = project(null);
  try {
    const seen = ask({ label: "loop.slow", reach: "external", run: "sleep 5" }, root, 1);
    assert.notEqual(
      seen.verdict,
      "ok",
      "spawnSync can report a timeout and an exit status of zero together, and reading only the status called a check that never answered healthy — which is the one thing this whole design exists to prevent",
    );
    assert.equal(seen.verdict, "blind");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the same failure on an internal check is broken, because nothing it needs is unreachable", () => {
  const root = project(null);
  try {
    assert.equal(ask({ label: "loop.i", reach: "internal", run: "sleep 5" }, root, 1).verdict, "broken");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check that reported an error is never ok, even with a zero exit status", () => {
  assert.equal(
    verdictOf(0, "external", false),
    "blind",
    "spawnSync can set an error and a zero status together when a process exits as its own timeout fires — seen on the first run of this command. Reading only the status called a check that never answered healthy",
  );
  assert.equal(verdictOf(0, "internal", false), "broken");
  assert.equal(verdictOf(0, "external", true), "ok");
  assert.equal(verdictOf(0, "internal", true), "ok");
});
