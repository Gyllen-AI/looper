import { reachedFrom } from "../src/init.ts";
import { gitHookEntryFor, launchFor, looperHooks } from "../src/config.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../src/init.ts";
import { assembleConstitution, readProjectConstitution } from "../src/doctrine.ts";
import { readMap } from "../src/map.ts";
import type { Step } from "../src/init.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "looper-init-"));
}

function pathsOf(steps: readonly Step[], kind: Step["kind"]): readonly string[] {
  return steps.filter((step) => step.kind === kind).map((step) => step.path);
}

test("a fresh project gets a doctrine tree it can actually use", () => {
  const root = scratch();
  try {
    const report = runInit(root, "installed");
    const made = pathsOf(report.steps, "scaffolded");

    assert.equal(made.length, 4);
    for (const tail of ["constitution.md", "map.toml", "README.md", ".mcp.json"]) {
      assert.ok(made.some((path) => path.endsWith(tail)), `${tail} was not created`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the constitution starts empty, so it costs nothing until someone writes a line", () => {
  const root = scratch();
  try {
    runInit(root, "installed");
    const project = readProjectConstitution(root);

    assert.equal(project.kind, "empty");
    const assembly = assembleConstitution(project);
    assert.deepEqual([...assembly.halves], ["canon"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the stub map parses, so the first branch someone adds works", () => {
  const root = scratch();
  try {
    runInit(root, "installed");
    const map = readMap(root);

    assert.equal(map.kind, "present");
    if (map.kind !== "present") return;
    assert.equal(map.governs.size, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nothing a project already wrote is touched", () => {
  const root = scratch();
  try {
    mkdirSync(join(root, ".looper/doctrine"), { recursive: true });
    writeFileSync(join(root, ".looper/doctrine/constitution.md"), "OUR OWN RULE\n");

    const report = runInit(root, "installed");

    assert.equal(
      readFileSync(join(root, ".looper/doctrine/constitution.md"), "utf8"),
      "OUR OWN RULE\n",
    );
    assert.ok(
      pathsOf(report.steps, "yours-already").some((path) =>
        path.endsWith("constitution.md"),
      ),
      "a file we did not write must be reported as left alone, never as created",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("twice is indistinguishable from once", () => {
  const root = scratch();
  try {
    runInit(root, "installed");
    const second = runInit(root, "installed");

    assert.deepEqual([...pathsOf(second.steps, "scaffolded")], []);
    assert.equal(pathsOf(second.steps, "yours-already").length, 4);
    assert.equal(pathsOf(second.steps, "already-wired").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper wires itself the way it was actually reached", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-reach-"));
  try {
    assert.equal(reachedFrom(root), "installed");

    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(root, "node_modules", ".bin", "looper"), "");
    assert.equal(reachedFrom(root), "local");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project that installed looper gets commands that resolve there", () => {
  const claude = looperHooks("local");
  for (const spec of claude) {
    assert.ok(
      spec.command.includes("node_modules/.bin/looper"),
      `${spec.event} was wired to ${spec.command}, which a project cannot run`,
    );
  }
  assert.equal(gitHookEntryFor("local"), "./node_modules/.bin/looper");
  assert.equal(launchFor("local").command, "./node_modules/.bin/looper");
});

test("a global install is still a bare name, and dev still runs from source", () => {
  assert.equal(gitHookEntryFor("installed"), "looper");
  assert.ok(gitHookEntryFor("dev").startsWith("node "));
});
