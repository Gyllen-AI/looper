import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readConcessions, standingOf } from "../src/law/concessions.ts";
import { misspelledIn } from "../src/law/misspelled.ts";
import { CHECKS } from "../src/law/checks.ts";

const KNOWN = CHECKS.map((held) => held.rule.id);

function withLaw(text: string): readonly string[] {
  const root = mkdtempSync(join(tmpdir(), "looper-spell-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/env.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "law.toml"), text);
    return misspelledIn(readConcessions(root), KNOWN);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a concession that names a rule correctly is not complained about", () => {
  assert.deepEqual(withLaw('[rules]\ndisabled = ["TS-TRUTH:2"]\n'), []);
  assert.deepEqual(withLaw('[exempt]\n"src/env.ts" = ["TS-TRUTH:2"]\n'), []);
  assert.deepEqual(withLaw('[exempt]\n"src/env.ts" = ["ALL"]\n'), []);
});

test("a mistyped rule is said out loud, with the nearest real one offered", () => {
  const said = withLaw('[rules]\ndisabled = ["TS-TRUTH-2"]\n');
  assert.equal(said.length, 1);
  assert.ok(first(said).includes("TS-TRUTH-2"));
  assert.ok(first(said).includes("Did you mean TS-TRUTH:2?"));
});

test("case matters, and the message says so by offering the real spelling", () => {
  const said = withLaw('[rules]\ndisabled = ["ts-truth:2"]\n');
  assert.equal(said.length, 1);
  assert.ok(first(said).includes("Did you mean TS-TRUTH:2?"));
});

test("ALL under [rules] is refused in words, not in silence", () => {
  const said = withLaw('[rules]\ndisabled = ["ALL"]\n');
  assert.equal(said.length, 1);
  assert.ok(first(said).includes("[exempt]"));
});

test("an exemption for a file that is not there is said out loud", () => {
  const said = withLaw('[exempt]\n"src/gone.ts" = ["TS-TRUTH:2"]\n');
  assert.equal(said.length, 1);
  assert.ok(first(said).includes("no such file"));
});

test("one concession, written once, is read by both halves", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-seam-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/settings.ts"), "export const a = 1;\n");
    writeFileSync(
      join(root, "law.toml"),
      ['[truth]', 'sanctum = "settings.ts"', 'env_files = ["settings.ts"]', ''].join("\n"),
    );
    const held = readConcessions(root);
    assert.equal(held.sanctum, "settings.ts", "[truth] is what the Rust half reads and looper ignored it");
    assert.deepEqual([...held.envFiles], ["settings.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project that wrote [ts] keeps working, and it wins where both exist", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-seam2-"));
  try {
    writeFileSync(
      join(root, "law.toml"),
      ['[truth]', 'sanctum = "from-truth.rs"', '', '[ts]', 'sanctum = "from-ts.ts"', ''].join("\n"),
    );
    assert.equal(readConcessions(root).sanctum, "from-ts.ts");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Rust pardon is honoured whichever id the project wrote", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-pardon-"));
  try {
    writeFileSync(
      join(root, "law.toml"),
      ['[exempt]', '"a.rs" = ["TRUTH:1"]', '"b.rs" = ["RUST-TRUTH:1"]', ''].join("\n"),
    );
    const held = readConcessions(root);
    assert.equal(standingOf(held, "a.rs", "RUST-TRUTH:1").kind, "pardoned", "the engine's spelling was not honoured");
    assert.equal(standingOf(held, "b.rs", "RUST-TRUTH:1").kind, "pardoned", "looper's own spelling was not honoured");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
