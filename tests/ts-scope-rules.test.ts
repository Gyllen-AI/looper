import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONCEDING_NOTHING, isNamed, readConcessions } from "../src/law/concessions.ts";
import { countIn, countWhere } from "./helpers.ts";
import type { Check } from "../src/law/engine.ts";
import { outsideWorldCheck } from "../src/law/ts/outside-world.ts";
import { strayPrintCheck } from "../src/law/ts/stray-print.ts";
import { hiddenDependencyCheck } from "../src/law/ts/hidden-dependency.ts";
import type { Concessions } from "../src/law/concessions.ts";

const count = (check: Check, file: string, text: string): number =>
  countWhere(check, text, file, CONCEDING_NOTHING);

test("reading the outside world outside the settings file is caught", () => {
  assert.equal(count(outsideWorldCheck, "src/db.ts", "const url = process.env.DATABASE_URL;"), 1);
  assert.equal(count(outsideWorldCheck, "src/db.ts", "const key = import.meta.env.KEY;"), 1);
});

test("the settings file is where it belongs, by name in any folder", () => {
  const text = "const url = process.env.DATABASE_URL;";
  assert.equal(count(outsideWorldCheck, "config.ts", text), 0);
  assert.equal(count(outsideWorldCheck, "src/config.ts", text), 0);
  assert.equal(count(outsideWorldCheck, "packages/api/config.ts", text), 0);
});

test("process used for other things is not the outside world", () => {
  assert.equal(count(outsideWorldCheck, "src/a.ts", "const here = process.cwd();"), 0);
  assert.equal(count(outsideWorldCheck, "src/a.ts", "process.exitCode = 1;"), 0);
});

test("printing outside the entry point is caught", () => {
  const printing = { ...CONCEDING_NOTHING, entryFiles: ["src/main.ts"] };
  assert.equal(countWhere(strayPrintCheck, "console.log('hi');", "src/lib.ts", printing), 1);
  assert.equal(countWhere(strayPrintCheck, "console.error('no');", "src/lib.ts", printing), 1);
  assert.equal(countWhere(strayPrintCheck, "console.log('hi');", "src/main.ts", printing), 0);
});

test("a local thing named console is not the real one", () => {
  const printing = { ...CONCEDING_NOTHING, entryFiles: [] };
  const text = "const console = { log() {} };\nconsole.log('hi');\n";
  assert.equal(count(strayPrintCheck, "src/lib.ts", text, printing), 0);
});

test("the entry point is read from what package.json declares, never guessed", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-entry-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "x", bin: { x: "./cli/start.ts" }, main: "./lib/index.ts" }),
    );
    const concessions = readConcessions(root);

    assert.ok(concessions.entryFiles.includes("./cli/start.ts"));
    assert.ok(concessions.entryFiles.includes("./lib/index.ts"));
    assert.equal(countWhere(strayPrintCheck, "console.log('x');", "cli/start.ts", concessions), 0);
    assert.equal(countWhere(strayPrintCheck, "console.log('x');", "src/other.ts", concessions), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("law.toml overrides what package.json declared", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-law-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ main: "./a.ts" }));
    writeFileSync(join(root, "law.toml"), '[entry]\nfiles = ["./b.ts"]\n\n[ts]\nsanctum = ["settings.ts"]\n');
    const concessions = readConcessions(root);

    assert.deepEqual([...concessions.entryFiles], ["./b.ts"]);
    assert.equal(concessions.sanctum, "settings.ts");
    assert.equal(countWhere(outsideWorldCheck, "const a = process.env.X;", "settings.ts", concessions), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a named file matches by whole path or by its own name, never halfway", () => {
  assert.ok(isNamed("src/config.ts", ["config.ts"]));
  assert.ok(isNamed("src/main.ts", ["./src/main.ts"]));
  assert.ok(!isNamed("src/myconfig.ts", ["config.ts"]));
  assert.ok(!isNamed("other/main.ts", ["src/main.ts"]));
});

const REACHED_SIDEWAYS: readonly (readonly [Check, string, number])[] = [
  [outsideWorldCheck, 'const a = process.env.TOKEN;', 1],
  [outsideWorldCheck, 'const p = process;\nconst a = p.env.TOKEN;', 1],
  [outsideWorldCheck, 'const { env } = process;\nconst a = env.TOKEN;', 1],
  [outsideWorldCheck, 'const a = process["env"].TOKEN;', 1],
  [outsideWorldCheck, 'const a = globalThis.process.env.TOKEN;', 1],
  [outsideWorldCheck, 'const base = process.env.URL;\nexport function f() { return fetch(base); }', 1],
  [outsideWorldCheck, 'export function f(process) { return process.env; }', 0],
  [strayPrintCheck, 'console.log("hi");', 1],
  [strayPrintCheck, 'const c = console;\nc.log("hi");', 1],
  [strayPrintCheck, 'const { log } = console;\nlog("hi");', 1],
  [strayPrintCheck, 'globalThis.console.log("hi");', 1],
  [strayPrintCheck, 'logger.info({ id }, "hi");', 0],
  [strayPrintCheck, 'export function f(console) { console.log("hi"); }', 0],
  [hiddenDependencyCheck, 'export function f() { return require("./m"); }', 1],
  [hiddenDependencyCheck, 'const r = require;\nexport function f() { return r("./m"); }', 1],
  [hiddenDependencyCheck, 'import { createRequire } from "node:module";\nexport function f() { return createRequire(import.meta.url)("./m"); }', 1],
];

test("a banned global is the same global however it is reached", () => {
  for (const [check, code, expected] of REACHED_SIDEWAYS) {
    assert.equal(countIn(check, code), expected, `wanted ${expected} for: ${code}`);
  }
});

test("loading late is the entry point's decision, and nobody else's", () => {
  const late = 'export async function f() { const m = await import("./m.ts"); return m; }';
  assert.equal(countWhere(hiddenDependencyCheck, late, "src/deep.ts", CONCEDING_NOTHING), 1);
  assert.equal(
    countWhere(hiddenDependencyCheck, late, "src/main.ts", {
      ...CONCEDING_NOTHING,
      entryFiles: ["src/main.ts"],
    }),
    0,
    "the rule's own advice says the entry point may decide this",
  );
});
