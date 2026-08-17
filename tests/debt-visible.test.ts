import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INJECTION_BUDGET } from "../src/config.ts";
import { Law, shrinkBaseline } from "../src/law/capability.ts";
import { readBaseline, totalIn } from "../src/law/baseline.ts";
import { runInit } from "../src/init.ts";
import { INSTALLED } from "../src/config.ts";

const NO_PATH: readonly string[] = [];

const GUILTY = `export async function load(id: string) {
  const base = process.env.API_URL;
  console.log("loading", id);
  try {
    return await fetch(base + id);
  } catch {
    return [];
  }
}
`;

const FIXED = `import { logger } from "pino";

export async function load(id: string, base: string) {
  logger.info({ id }, "loading");
  try {
    return await fetch(base + id);
  } catch (cause) {
    throw new Failed(id, cause);
  }
}
`;

function adopted(source: string): string {
  const root = mkdtempSync(join(tmpdir(), "looper-debt-"));
  mkdirSync(join(root, "src"), { recursive: true });
  const git = (...args: readonly string[]) =>
    execFileSync("git", [...args], { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(join(root, "src/orders.ts"), source);
  git("add", "-A");
  git("commit", "-qm", "before");
  runInit(root, INSTALLED, NO_PATH);
  return root;
}

function injected(root: string): readonly string[] {
  return new Law().inject({ root, budget: INJECTION_BUDGET }).map((held) => held.text);
}

test("outstanding work is said every turn, not left in a file", () => {
  const root = adopted(GUILTY);
  try {
    const said = injected(root);
    assert.equal(said.length, 1);
    assert.ok(first(said).includes("4"));
    assert.ok(first(said).includes("block nothing"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project with nothing outstanding is told nothing", () => {
  const root = adopted("export const rate = 0.2;\n");
  try {
    assert.deepEqual([...injected(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the line is short enough to say every turn", () => {
  const root = adopted(GUILTY);
  try {
    assert.ok(first(injected(root)).length < 300);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finishing a turn shrinks the record to what is actually left", () => {
  const root = adopted(GUILTY);
  try {
    assert.equal(totalIn(readBaseline(root)), 4);

    writeFileSync(join(root, "src/orders.ts"), FIXED);
    shrinkBaseline(root);

    assert.equal(totalIn(readBaseline(root)), 0);
    assert.deepEqual([...injected(root)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the record never grows back when new problems appear", () => {
  const root = adopted(GUILTY);
  try {
    writeFileSync(join(root, "src/new.ts"), GUILTY);
    shrinkBaseline(root);

    assert.equal(
      totalIn(readBaseline(root)),
      4,
      "a new file's problems are refused at the gate, never added to what is forgiven",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
