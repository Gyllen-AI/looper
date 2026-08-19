import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BASELINE_PATH } from "../src/config.ts";
import { adoptedButUnrecorded } from "../src/law/baseline.ts";
import { gitIn as git } from "./helpers.ts";

const ROOT = join(import.meta.dirname, "..");

test("this project's own baseline is committed, so a clone judges what we judge", () => {
  assert.ok(
    existsSync(join(ROOT, BASELINE_PATH)),
    `${BASELINE_PATH} is gone, and every problem older than looper reads as new`,
  );
  const tracked = mkdtempSync(join(tmpdir(), "looper-tracked-"));
  try {
    const said = execFileSync("git", ["ls-files", BASELINE_PATH], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    assert.equal(
      said,
      BASELINE_PATH,
      `${BASELINE_PATH} is not tracked. A colleague who clones this repository gets no baseline, so looper reports every problem that was here before it as new and blocking, and nothing tells them why.`,
    );
  } finally {
    rmSync(tracked, { recursive: true, force: true });
  }
});

test("a project that adopted looper and lost its baseline is told so, not judged in silence", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-lost-"));
  try {
    git(root, "init", "-q");
    assert.equal(
      adoptedButUnrecorded(root),
      false,
      "a project that never adopted looper is not missing anything",
    );

    mkdirSync(join(root, ".looper", "doctrine"), { recursive: true });
    writeFileSync(join(root, ".looper", "doctrine", "constitution.md"), "# rules\n");
    assert.equal(
      adoptedButUnrecorded(root),
      true,
      "the doctrine is here and the baseline is not, which is what a clone of a project whose baseline was never committed looks like",
    );

    writeFileSync(join(root, BASELINE_PATH), "\n");
    assert.equal(adoptedButUnrecorded(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
