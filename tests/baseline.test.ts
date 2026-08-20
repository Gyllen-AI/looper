import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { countsOf, readBaseline, shrinkToward, totalIn } from "../src/law/baseline.ts";

const NOTHING_UNREAD: readonly string[] = [];
import { Law } from "../src/law/capability.ts";
import { law } from "../src/commands/law.ts";
import { gitIn as git, first } from "./helpers.ts";
import { INSTALLED } from "../src/config.ts";

const NO_PATH: readonly string[] = [];

import { runInit } from "../src/init.ts";
import { dispatchHook } from "../src/registry.ts";
import { STUB_VALUE } from "../src/law/ts/stub-value.ts";
import { VANISHED_ERROR } from "../src/law/ts/vanished-error.ts";
import type { Violation } from "../src/law/rule.ts";

function atRule(file: string, line: number, rule: Rule): Violation {
  return { rule, file, line };
}

const LEGACY = `export async function load(id: string) {
  const base = process.env.API_URL;
  console.log("loading", id);
  try {
    return await fetch(base + id);
  } catch {
    return [];
  }
}
`;

function legacyRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-base-"));
  mkdirSync(join(root, "src"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(join(root, "src/orders.ts"), LEGACY);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "before looper");
  runInit(root, INSTALLED, NO_PATH);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "adopt looper");
  return root;
}

function commitNow(root: string) {
  return dispatchHook([new Law()], {
    root,
    event: "PreToolUse",
    payload: {
      kind: "text",
      text: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit -m x" } }),
    },
  });
}

function stage(root: string, file: string, text: string): void {
  writeFileSync(join(root, file), text);
  git(root, "add", "-A");
}

function at(file: string, line: number): Violation {
  return atRule(file, line, STUB_VALUE);
}


test("adopting a repo with existing problems records them rather than refusing", () => {
  const root = legacyRepo();
  try {
    const baseline = readBaseline(root);
    assert.ok(totalIn(baseline) > 0, "the existing problems were recorded");
    assert.ok(readFileSync(join(root, ".looper/baseline.toml"), "utf8").includes("src/orders.ts"));
    assert.deepEqual([...commitNow(root).refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a new problem in a new file is refused, baseline or no baseline", () => {
  const root = legacyRepo();
  try {
    stage(root, "src/new.ts", "export function f() { try { g() } catch { return null } }\n");
    assert.equal(commitNow(root).refusals.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("touching a line that already had a problem stops forgiving it", () => {
  const root = legacyRepo();
  try {
    stage(root, "src/orders.ts", LEGACY.replace('"loading"', '"loading now"'));
    const refusals = commitNow(root).refusals;

    assert.equal(refusals.length, 1);
    assert.ok(first(refusals).reason.includes("TS-LOG:1"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("changing an untouched part of a baselined file leaves the rest forgiven", () => {
  const root = legacyRepo();
  try {
    stage(root, "src/orders.ts", `${LEGACY}\nexport const version = 2;\n`);
    assert.deepEqual([...commitNow(root).refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a baseline only ever shrinks, and reports by how much", () => {
  const recorded = countsOf([
    at("a.ts", 1),
    at("a.ts", 2),
    at("a.ts", 3, VANISHED_ERROR),
  ]);

  const fewer = countsOf([at("a.ts", 1)]);

  const shrink = shrinkToward(recorded, fewer, NOTHING_UNREAD);
  assert.equal(shrink.kind, "shrunk");
  if (shrink.kind !== "shrunk") return;
  assert.equal(shrink.by, 2);
  assert.equal(totalIn(shrink.baseline), 1);
});

test("a baseline never grows on its own", () => {
  const recorded = countsOf([at("a.ts", 1)]);
  const more = countsOf([at("a.ts", 1), at("a.ts", 9)]);

  assert.equal(shrinkToward(recorded, more, NOTHING_UNREAD).kind, "unchanged");
  assert.equal(totalIn(recorded), 1);
});

test("a clean project gets no baseline file at all", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-clean-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(join(root, "src/a.ts"), "export const total = 1;\n");
    const report = runInit(root, INSTALLED, NO_PATH);

    assert.ok(report.steps.some((step) => step.kind === "surveyed-clean"));
    assert.equal(totalIn(readBaseline(root)), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("looper law and the commit gate answer the same question the same way", () => {
  const root = legacyRepo();
  const wasIn = process.cwd();
  try {
    const before = readBaseline(root).get("src/orders.ts");
    const recorded = before === undefined ? undefined : before.get("TS-TRUTH:2");
    assert.ok(
      recorded !== undefined && recorded > 0,
      `the probe needs a rule the file already has recorded, or a second rule masks the result: ${JSON.stringify(before === undefined ? [] : [...before])}`,
    );

    writeFileSync(join(root, "src/orders.ts"), `const probeOne = process.env.PROBE;\n${LEGACY}`);
    process.chdir(root);

    const out: string[] = [];
    const said = law(NO_PATH, { say: (line) => out.push(line), warn: (line) => out.push(line) });

    assert.equal(
      said,
      2,
      `adopter issue #94: a problem written one minute ago on a line that did not exist before reads as pre-existing, because looper law asked only whether the rule is recorded for the file while the gate also asks whether you touched the line. The command a person runs to check their own work must not give the reassuring answer the gate will contradict.\n${out.join("\n")}`,
    );
    assert.ok(
      !out.join("\n").includes("All "),
      `the count line still claims every problem is older:\n${out.join("\n")}`,
    );
  } finally {
    process.chdir(wasIn);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a recorded count larger than what is in the file changes no verdict", () => {
  const root = legacyRepo();
  const wasIn = process.cwd();
  try {
    const recorded = readFileSync(join(root, ".looper/baseline.toml"), "utf8");
    assert.ok(recorded.includes('"TS-TRUTH:2" = 1'), `the fixture stopped recording it: ${recorded}`);
    writeFileSync(
      join(root, ".looper/baseline.toml"),
      `${recorded.replace('"TS-TRUTH:2" = 1', '"TS-TRUTH:2" = 13')}"TS-DECOMPOSITION:1" = 1\n`,
    );
    writeFileSync(join(root, "src/orders.ts"), `const probeOne = process.env.PROBE;\n${LEGACY}`);
    process.chdir(root);

    const out: string[] = [];
    assert.equal(
      law(NO_PATH, { say: (line) => out.push(line), warn: (line) => out.push(line) }),
      2,
      `adopter issue #94 reported twelve spare slots left behind by obeying TS-DECOMPOSITION:1, and read them as what absorbed the new problem. They are not: the decision asks whether you touched the line, so a surplus grants nothing.\n${out.join("\n")}`,
    );
  } finally {
    process.chdir(wasIn);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file the survey could not read keeps every problem recorded against it", () => {
  const recorded = new Map([
    ["Contoso.Widgets/Plugins/OrderSync.cs", new Map([["CS-DEAD:2", 205]])],
    ["src/a.ts", new Map([["TS-LOG:1", 2]])],
  ]);
  const readNothingCsharp = new Map([["src/a.ts", new Map([["TS-LOG:1", 2]])]]);

  const shrink = shrinkToward(recorded, readNothingCsharp, [
    "51 C# files (the C# half would not start)",
  ]);

  assert.equal(
    shrink.kind,
    "not-all-read",
    "a survey that could not read the C# half must not conclude the C# problems were fixed",
  );
});

test("with nothing unread the same survey does shrink", () => {
  const recorded = new Map([
    ["Contoso.Widgets/Plugins/OrderSync.cs", new Map([["CS-DEAD:2", 205]])],
    ["src/a.ts", new Map([["TS-LOG:1", 2]])],
  ]);
  const readEverything = new Map([["src/a.ts", new Map([["TS-LOG:1", 2]])]]);

  const shrink = shrinkToward(recorded, readEverything, NOTHING_UNREAD);

  assert.equal(shrink.kind, "shrunk");
  if (shrink.kind !== "shrunk") return;
  assert.equal(shrink.by, 205);
  assert.equal(shrink.baseline.has("Contoso.Widgets/Plugins/OrderSync.cs"), false);
});
