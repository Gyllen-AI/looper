import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gitIn } from "./helpers.ts";

const REPO = join(import.meta.dirname, "..");

const NODE_MODULES_REFUSAL = "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING";

function installedProject(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-installed-"));
  const packaged = join(root, "node_modules", "looper");
  mkdirSync(packaged, { recursive: true });
  for (const part of ["bin", "src"]) {
    cpSync(join(REPO, part), join(packaged, part), { recursive: true });
  }
  cpSync(join(REPO, "package.json"), join(packaged, "package.json"));
  symlinkSync(join(REPO, "node_modules", "@babel"), join(root, "node_modules", "@babel"), "dir");
  gitIn(root, "init");
  return root;
}

function run(root: string, entry: readonly string[], command: string) {
  return spawnSync(process.execPath, [join(root, "node_modules", "looper", ...entry), command], {
    cwd: root,
    encoding: "utf8",
  });
}

test("an installed looper wires a project, which is what node_modules used to make impossible", () => {
  const root = installedProject();
  try {
    const ran = run(root, ["bin", "looper.js"], "init");

    assert.equal(ran.status, 0, `looper init failed from node_modules: ${ran.stderr}`);
    const settings = join(root, ".claude", "settings.json");
    assert.ok(existsSync(settings), "init reported nothing and wrote no agent hooks");
    assert.ok(
      readFileSync(settings, "utf8").includes("looper"),
      "the settings file exists and does not mention looper",
    );
    assert.ok(
      existsSync(join(root, ".git", "hooks", "pre-commit")),
      "the commit gate was not written, so nothing is actually gated",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the shim says nothing on a path that runs on every turn", () => {
  const root = installedProject();
  try {
    const ran = run(root, ["bin", "looper.js"], "status");
    assert.ok(
      !ran.stderr.includes("ExperimentalWarning"),
      `looper printed a Node warning into the agent's output: ${ran.stderr}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Node too old to run looper is told so in words it can act on", () => {
  const shim = readFileSync(join(REPO, "bin", "looper.js"), "utf8");
  assert.ok(
    !/import \{[^}]*\} from "node:module"/.test(shim),
    "a named import of something an older Node does not have fails at load, before the sentence explaining why. The check has to be reachable on the version it is about.",
  );

  const held: unknown = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  const engines = Object.getOwnPropertyDescriptor(held, "engines")?.value;
  const wanted = String(Object.getOwnPropertyDescriptor(engines, "node")?.value).replace(/[^0-9.]/g, "");
  assert.ok(
    shim.includes(wanted),
    `package.json asks for Node ${wanted} and the message the shim prints names a different version`,
  );
});

test("Node still refuses the TypeScript entry, which is the whole reason the shim exists", () => {
  const root = installedProject();
  try {
    const ran = run(root, ["src", "main.ts"], "status");
    assert.ok(
      ran.stderr.includes(NODE_MODULES_REFUSAL),
      "Node now strips types under node_modules. bin/looper.js can be deleted and the bin pointed back at src/main.ts.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
