import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { freshnessOf } from "../src/law/engine-age.ts";

function engine(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-age-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/one.rs"), "fn main() {}\n");
  writeFileSync(join(root, "Cargo.toml"), "[package]\n");
  writeFileSync(join(root, "binary"), "");
  return root;
}

function ageOf(root: string, seconds: number, path: string): void {
  const when = new Date(Date.now() + seconds * 1000);
  utimesSync(join(root, path), when, when);
}

test("a binary newer than every source is current", () => {
  const root = engine();
  try {
    ageOf(root, 60, "binary");
    assert.equal(freshnessOf(join(root, "binary"), [join(root, "src")], []).kind, "current");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a source written after the binary asks for a rebuild, and says which", () => {
  const root = engine();
  try {
    ageOf(root, 60, "src/one.rs");
    const said = freshnessOf(join(root, "binary"), [join(root, "src")], []);
    assert.equal(said.kind, "rebuild");
    if (said.kind !== "rebuild") return;
    assert.ok(said.why.includes("changed"), said.why);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a changed manifest is a changed engine", () => {
  const root = engine();
  try {
    ageOf(root, 60, "binary");
    ageOf(root, 120, "Cargo.toml");
    const said = freshnessOf(join(root, "binary"), [join(root, "src")], [join(root, "Cargo.toml")]);
    assert.equal(said.kind, "rebuild");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no binary at all is named as that, not as staleness", () => {
  const root = engine();
  try {
    const said = freshnessOf(join(root, "nothing"), [join(root, "src")], []);
    assert.equal(said.kind, "rebuild");
    if (said.kind !== "rebuild") return;
    assert.ok(said.why.includes("nothing"), said.why);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a source it cannot read is a rebuild that names the file, never a silent pass", () => {
  const root = engine();
  try {
    ageOf(root, 60, "binary");
    const said = freshnessOf(join(root, "binary"), [join(root, "src"), join(root, "gone")], []);
    assert.equal(
      said.kind,
      "rebuild",
      "an unreadable source read as age zero, so a stale engine judged every file with rules nobody could see",
    );
    if (said.kind !== "rebuild") return;
    assert.ok(said.why.includes("gone"), said.why);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
