import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { judgedFiles } from "../src/law/project.ts";
import { ignoredHere } from "../src/git.ts";
import { walkProject } from "../src/law/project.ts";

const A_JUDGED_FILE = "const held = 1;\nexport default held;\n";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-ignored-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function gone(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

test("a file git is told to ignore is not judged, because the baseline never saw it", () => {
  const root = repo();
  try {
    writeFileSync(join(root, ".gitignore"), "build/\n");
    writeFileSync(join(root, "kept.ts"), A_JUDGED_FILE);
    mkdirSync(join(root, "build"));
    writeFileSync(join(root, "build", "made.ts"), A_JUDGED_FILE);

    const judged = judgedFiles(root).map((path) => path.slice(root.length + 1));

    assert.deepEqual(judged.filter((path) => path.startsWith("build")), []);
    assert.ok(judged.includes("kept.ts"), "a file nobody ignores is still judged");
  } finally {
    gone(root);
  }
});

test("a single ignored file is skipped, not only an ignored folder", () => {
  const root = repo();
  try {
    writeFileSync(join(root, ".gitignore"), "generated.ts\n");
    writeFileSync(join(root, "generated.ts"), A_JUDGED_FILE);
    writeFileSync(join(root, "written.ts"), A_JUDGED_FILE);

    const judged = judgedFiles(root).map((path) => path.slice(root.length + 1));

    assert.deepEqual(judged, ["written.ts"]);
  } finally {
    gone(root);
  }
});

test("a new file nobody has added yet is judged, because it is code someone is writing", () => {
  const root = repo();
  try {
    writeFileSync(join(root, ".gitignore"), "build/\n");
    writeFileSync(join(root, "fresh.ts"), A_JUDGED_FILE);

    assert.ok(judgedFiles(root).some((path) => path.endsWith("fresh.ts")));
  } finally {
    gone(root);
  }
});

test("without git, everything is judged as before rather than nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-nogit-"));
  try {
    writeFileSync(join(root, "alone.ts"), A_JUDGED_FILE);

    assert.equal(ignoredHere(root).kind, "no-git");
    assert.ok(judgedFiles(root).some((path) => path.endsWith("alone.ts")));
    assert.equal(
      walkProject(root).couldNotSkipIgnored,
      "",
      "a folder that is simply not a git repository was reported as a failure, so every project without git would carry a warning about nothing being wrong",
    );
  } finally {
    gone(root);
  }
});
