import { test } from "node:test";
import { DEV, INSTALLED, LOCAL, gitHookEntryFor, inside, launchFor, looperHooks } from "../src/config.ts";
import { reachedFrom } from "../src/init.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../src/init.ts";

const NO_PATH: readonly string[] = [];
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
    const report = runInit(root, INSTALLED, NO_PATH);
    const made = pathsOf(report.steps, "scaffolded");

    assert.equal(made.length, 4);
    for (const tail of ["constitution.md", "map.toml", "README.md", "secrets.allow"]) {
      assert.ok(made.some((path) => path.endsWith(tail)), `${tail} was not created`);
    }
    assert.ok(
      pathsOf(report.steps, "created").some((path) => path.endsWith(".mcp.json")),
      "the MCP file is wired rather than scaffolded, because a project that already has one still needs looper's server added to it",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the file the secrets gate names is one init actually creates", () => {
  const root = scratch();
  try {
    runInit(root, INSTALLED, NO_PATH);
    const written = readFileSync(join(root, ".looper/secrets.allow"), "utf8");

    assert.ok(
      written.includes("This file is the review"),
      "the gate tells somebody to add a value to a file that does not exist, with no header saying that every line in it is a decision a reviewer will read",
    );
    assert.deepEqual(
      written.split("\n").filter((line) => line.trim().length > 0 && !line.startsWith("#")),
      [],
      "it must arrive empty. A scaffolded allowance with anything in it is an invitation, and an empty one is a review waiting to happen.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the constitution starts empty, so it costs nothing until someone writes a line", () => {
  const root = scratch();
  try {
    runInit(root, INSTALLED, NO_PATH);
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
    runInit(root, INSTALLED, NO_PATH);
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

    const report = runInit(root, INSTALLED, NO_PATH);

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
    runInit(root, INSTALLED, NO_PATH);
    const second = runInit(root, INSTALLED, NO_PATH);

    assert.deepEqual([...pathsOf(second.steps, "scaffolded")], []);
    assert.equal(pathsOf(second.steps, "yours-already").length, 4);
    assert.equal(pathsOf(second.steps, "already-wired").length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project with its own .mcp.json gets looper's server added to it", () => {
  const root = scratch();
  try {
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { theirs: { command: "their-server" } } }, null, 2),
    );

    runInit(root, INSTALLED, NO_PATH);
    const held: unknown = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    const servers = Object.getOwnPropertyDescriptor(held, "mcpServers")?.value;

    assert.ok(
      Object.getOwnPropertyDescriptor(servers, "theirs") !== undefined,
      "the server they already had was dropped, which is the failure merging exists to prevent",
    );
    assert.ok(
      Object.getOwnPropertyDescriptor(servers, "looper") !== undefined,
      "looper's server was not added, so the doctrine and recall tools silently never appear",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a command the hooks cannot reach is said out loud, not left looking wired", () => {
  const root = scratch();
  try {
    const report = runInit(root, INSTALLED, NO_PATH);

    assert.ok(
      report.steps.some((step) => step.kind === "entry-unreachable"),
      "the hooks name a command that is nowhere on PATH. They look right in the settings file and do nothing at all, which is the one outcome init exists to prevent.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper checked out inside a project is wired as the checkout it is", () => {
  const root = scratch();
  try {
    const at = join(root, "vendor", "looper");
    mkdirSync(join(at, "bin"), { recursive: true });
    writeFileSync(join(at, "bin", "looper.js"), "");
    writeFileSync(join(at, "package.json"), JSON.stringify({ name: "looper" }, null, 2));

    const reached = reachedFrom(root);
    assert.deepEqual(reached, inside("vendor/looper"));

    for (const spec of looperHooks(reached)) {
      assert.ok(
        spec.command.includes("vendor/looper/bin/looper.js"),
        `${spec.event} was wired to ${spec.command}, which is not where looper actually is`,
      );
    }

    const bare = runInit(root, reached, NO_PATH);
    assert.ok(
      bare.steps.some((step) => step.kind === "entry-unreachable"),
      "a checkout with no node_modules cannot run a line of looper, and init reported it as wired",
    );

    mkdirSync(join(at, "node_modules"), { recursive: true });
    const ready = runInit(root, reached, NO_PATH);
    assert.ok(
      !ready.steps.some((step) => step.kind === "entry-unreachable"),
      "the checkout is right there, installed, and init still said it could not be reached",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper wires itself the way it was actually reached", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-reach-"));
  try {
    assert.deepEqual(reachedFrom(root), INSTALLED);

    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(root, "node_modules", ".bin", "looper"), "");
    assert.deepEqual(reachedFrom(root), LOCAL);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project that installed looper gets commands that resolve there", () => {
  const claude = looperHooks(LOCAL);
  for (const spec of claude) {
    assert.ok(
      spec.command.includes("node_modules/.bin/looper"),
      `${spec.event} was wired to ${spec.command}, which a project cannot run`,
    );
  }
  assert.equal(gitHookEntryFor(LOCAL), "./node_modules/.bin/looper");
  assert.equal(launchFor(LOCAL).command, "./node_modules/.bin/looper");
});

test("a global install is still a bare name, and dev still runs from source", () => {
  assert.equal(gitHookEntryFor(INSTALLED), "looper");
  assert.ok(gitHookEntryFor(DEV).startsWith("node "));
});
